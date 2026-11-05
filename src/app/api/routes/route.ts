import { NextRequest, NextResponse } from 'next/server';
import { calculateRouteKPI, calculateDashboardSummary } from '@/lib/kpiCalculator';
import { Route, Equipment, RouteKPI, RouteRound } from '@/types';
import { translations, Language } from '@/i18n/translations';
import { checkRateLimit } from '@/lib/rateLimiter';
import { sanitizeDriverName, sanitizeString } from '@/lib/sanitize';

// Helper function to translate text
function t(key: string, lang: Language): string {
  return translations[lang]?.[key] || key;
}

function calculateTrafficInsights(kpis: RouteKPI[], isHoliday: boolean = false, language: Language = 'he'): any {
  let trafficRisk = t('traffic.low', language);
  let trafficNote = '';

  if (!kpis || kpis.length === 0) {
    return { trafficRisk, trafficNote };
  }

  // Peak hours in Israel: 7-9 AM and 4-7 PM
  // Holidays cause heavier traffic
  const maxDuration = Math.max(...kpis.map(k => k.totalDurationMinutes));

  if (maxDuration > 600) {
    trafficRisk = t('traffic.medium_high', language);
    trafficNote = t('traffic.peak_hours', language);
    if (isHoliday) {
      trafficNote += t('traffic.holiday_extra', language);
    }
  } else if (maxDuration > 360) {
    const hasEveningRisk = kpis.some(k => k.totalDurationMinutes > 360);
    if (hasEveningRisk) {
      trafficRisk = t('traffic.medium', language);
      trafficNote = t('traffic.evening_risk', language);
      if (isHoliday) {
        trafficNote += t('traffic.holiday_extra', language);
      }
    }
  } else if (isHoliday) {
    trafficRisk = t('traffic.medium', language);
    trafficNote = t('traffic.holiday', language);
  }

  return { trafficRisk, trafficNote };
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('roadnet_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Rate limiting: 30 requests per minute per token
    const rateLimitAllowed = await checkRateLimit(token, 30, 60000);
    if (!rateLimitAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Maximum 30 requests per minute' },
        { status: 429 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    const { searchParams } = new URL(request.url);
    const rawSessionDate = searchParams.get('sessionDate');
    const sessionDate = rawSessionDate || new Date().toISOString().split('T')[0];

    // Validate sessionDate format (yyyy-MM-dd)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return NextResponse.json(
        { error: 'Invalid sessionDate format. Use yyyy-MM-dd' },
        { status: 400 }
      );
    }

    const language = (searchParams.get('language') || 'he') as Language;
    if (!['he', 'en', 'es'].includes(language)) {
      return NextResponse.json(
        { error: 'Invalid language parameter' },
        { status: 400 }
      );
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: 'Missing API base URL' },
        { status: 500 }
      );
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const routesUrl = `${baseUrl}/v1/dailyplan/routes?expand=All&sessionDate=${sessionDate}`;
    const routesResponse = await fetch(routesUrl, { headers });

    if (routesResponse.status === 401) {
      return NextResponse.json(
        { error: 'Token expired' },
        { status: 401 }
      );
    }

    if (!routesResponse.ok) {
      const errorText = await routesResponse.text();
      return NextResponse.json(
        {
          error: 'Failed to fetch data from ROADNET',
          details: {
            routesStatus: routesResponse.status,
            equipmentStatus: 'unknown',
            errorText: errorText.substring(0, 500),
          }
        },
        { status: 500 }
      );
    }

    let routesData;
    try {
      routesData = await routesResponse.json();
    } catch (parseError) {
      return NextResponse.json(
        { error: 'Failed to parse ROADNET response' },
        { status: 500 }
      );
    }

    const rawRoutes: Route[] = routesData.items || routesData.routes || routesData.data || [];

    // Check if it's Friday (normal work day is 5 hours, not 9)
    const [year, month, day] = sessionDate.split('-').map(Number);
    const sessionDateObj = new Date(year, month - 1, day); // month is 0-indexed
    const dayOfWeek = sessionDateObj.getDay(); // 5 = Friday
    const normalWorkDayMinutes = dayOfWeek === 5 ? 300 : 540; // 5 hours for Friday, 9 hours otherwise

    // Fetch equipment types for vehicle capacity
    let equipmentTypes: Record<string, any> = {};
    let equipmentMap: Record<string, any> = {}; // specific equipment ID -> equipment type info

    try {
      const equipmentTypeUrl = `${baseUrl}/v1/admin/equipmentType?expand=All`;
      const equipmentTypeResponse = await fetch(equipmentTypeUrl, { headers });
      if (equipmentTypeResponse.ok) {
        const equipmentTypeData = await equipmentTypeResponse.json();
        if (equipmentTypeData.items && Array.isArray(equipmentTypeData.items)) {
          equipmentTypes = Object.fromEntries(
            equipmentTypeData.items.map((eq: any) => [eq.identity?.identifier, eq])
          );
        }
      }

      // Fetch specific equipment (e.g., "1.5" -> maps to PEUGEOT equipment type)
      const equipmentUrl = `${baseUrl}/v1/admin/equipment?expand=All`;
      const equipmentResponse = await fetch(equipmentUrl, { headers });
      if (equipmentResponse.ok) {
        const equipmentData = await equipmentResponse.json();
        if (equipmentData.items && Array.isArray(equipmentData.items)) {
          equipmentMap = Object.fromEntries(
            equipmentData.items.map((eq: any) => [
              eq.identity?.identifier,
              {
                name: eq.identity?.identifier,
                equipmentTypeIdentity: eq.equipmentTypeIdentity?.identifier,
                equipment: equipmentTypes[eq.equipmentTypeIdentity?.identifier]
              }
            ])
          );
        }
      }
    } catch (err) {
      console.error('Failed to fetch equipment:', err);
    }

    // Map ROADNET routes to our RouteKPI format
    const kpis: RouteKPI[] = rawRoutes.map((route, index) => {
      let totalWeight = 0;
      let stopCount = 0;
      let totalDurationMinutes = 0;
      let serviceTimeMinutes = 0;
      let travelTimeMinutes = 0;

      if (route.stops && Array.isArray(route.stops)) {
        // Count only ServiceableStop, not DEPOT
        stopCount = route.stops.filter((stop: any) =>
          stop.stopType === 'ServiceableStop'
        ).length;

        // Calculate times from stops: startTimestamp of first stop to completeTimestamp of last stop
        const firstStop = route.stops[0];
        const lastStop = route.stops[route.stops.length - 1];

        // Get startTimestamp from OriginDepotStop or fallback to route.routeStartTime
        let routeStart = route.routeStartTime ? new Date(route.routeStartTime).getTime() : 0;
        if (firstStop?.originDepotStopInfo?.startTimestamp) {
          routeStart = new Date(firstStop.originDepotStopInfo.startTimestamp).getTime();
        }

        // Get completeTimestamp from DestinationDepotStop
        let routeEnd = routeStart;
        if (lastStop?.destinationDepotStopInfo?.completeTimestamp) {
          routeEnd = new Date(lastStop.destinationDepotStopInfo.completeTimestamp).getTime();
        }

        // Total duration in minutes
        totalDurationMinutes = Math.round((routeEnd - routeStart) / 60000);

        // Sum weights and service times
        totalWeight = route.stops.reduce((sum: number, stop: any) => {
          let weight = 0;
          const deliveryQuantities = stop.serviceableStopInfo?.totalDeliveryQuantities ||
                                   stop.totalDeliveryQuantities;

          if (deliveryQuantities) {
            if (Array.isArray(deliveryQuantities)) {
              weight = deliveryQuantities[0] || 0;
            } else if (typeof deliveryQuantities === 'number') {
              weight = deliveryQuantities;
            }
          }

          // Add service time
          const serviceTime = stop.serviceableStopInfo?.totalPlannedServiceTime?.value?.minutes ||
                            stop.totalPlannedServiceTime?.value?.minutes || 0;
          serviceTimeMinutes += serviceTime;

          return sum + weight;
        }, 0);

        // Travel time = Total Time - Service Time
        travelTimeMinutes = Math.max(0, totalDurationMinutes - serviceTimeMinutes);
      }

      // Get vehicle type and capacity from equipment (need this before calculating rounds)
      const specificEquipmentId = route.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier;
      const specificEquipment = equipmentMap[specificEquipmentId];
      const equipmentType = specificEquipment?.equipment;
      const vehicleType = specificEquipment?.equipmentTypeIdentity || specificEquipmentId || 'unknown';
      const vehicleCapacity = equipmentType?.operational?.capacity?.[0] || 0;

      // Identify rounds (split by MidrouteDepotStop)
      const rounds: RouteRound[] = [];
      if (route.stops && Array.isArray(route.stops)) {
        let currentRound: any = { weight: 0, stops: 0 };
        let roundNumber = 1;

        for (const stop of route.stops) {
          if (stop.stopType === 'MidrouteDepotStop') {
            // End current round and start new one
            if (currentRound.stops > 0) {
              rounds.push({
                roundNumber,
                weight: currentRound.weight,
                stopCount: currentRound.stops,
                weightUtilization: vehicleCapacity > 0 ? Math.round((currentRound.weight / vehicleCapacity) * 100) : 0
              });
              roundNumber++;
              currentRound = { weight: 0, stops: 0 };
            }
            continue;
          }

          // Only count ServiceableStop, not DEPOT
          if (stop.stopType === 'ServiceableStop') {
            const deliveryQuantities = stop.serviceableStopInfo?.totalDeliveryQuantities ||
                                     stop.totalDeliveryQuantities;
            let weight = 0;
            if (deliveryQuantities) {
              if (Array.isArray(deliveryQuantities)) {
                weight = deliveryQuantities[0] || 0;
              } else if (typeof deliveryQuantities === 'number') {
                weight = deliveryQuantities;
              }
            }
            currentRound.weight += weight;
            currentRound.stops += 1;
          }
        }

        // Add last round if it has stops
        if (currentRound.stops > 0) {
          rounds.push({
            roundNumber,
            weight: currentRound.weight,
            stopCount: currentRound.stops,
            weightUtilization: vehicleCapacity > 0 ? Math.round((currentRound.weight / vehicleCapacity) * 100) : 0
          });
        }
      }

      // A multi-round route reloads at the depot, so measure it against one truckload
      // per round (average load per round). Comparing the whole day's weight to a single
      // truckload reported 150%+ for normal 2-round routes. Overload is checked per round below.
      const roundCount = Math.max(rounds.length, 1);
      const weightUtilization = vehicleCapacity > 0 ? Math.round((totalWeight / (vehicleCapacity * roundCount)) * 100) : 0;
      const timeUtilization = Math.round((totalDurationMinutes / normalWorkDayMinutes) * 100);

      // Check if any round exceeds weight capacity
      const hasWeightOverage = rounds.some(r => r.weightUtilization > 100);

      const insights: string[] = [];
      const localeString = language === 'he' ? 'he-IL' : language === 'es' ? 'es-ES' : 'en-US';

      if (rounds.length > 1) {
        const roundsLabel = t('insight.rounds_weight', language);
        const kg = language === 'he' ? 'ק"ג' : language === 'es' ? 'kg' : 'kg';
        insights.push(`${rounds.length} ${roundsLabel} ${totalWeight.toLocaleString(localeString)} ${kg}`);
      } else {
        const weightLabel = language === 'he' ? '%' : '%';
        const stopsLabel = t('kpi.stops', language);
        const weightText = t('insight.single_round', language);
        insights.push(`${weightUtilization}${weightLabel} ${weightText}, ${stopCount} ${stopsLabel}`);
      }

      if (timeUtilization > 100) {
        insights.push(t('insight.overtime', language));
      } else if (timeUtilization < 70 && weightUtilization >= 50) {
        insights.push(t('insight.add_more_stops', language));
      }

      if (hasWeightOverage) {
        insights.push(t('insight.round_overweight', language));
      } else if (weightUtilization < 50 && timeUtilization < 80 && rounds.length === 1) {
        insights.push(t('insight.low_weight_combine', language));
      }

      let driverName = route.workersInfo?.[0]?.name?.firstName || (language === 'he' ? 'ללא נהג' : language === 'es' ? 'Sin conductor' : 'No driver');
      driverName = sanitizeDriverName(driverName);

      return {
        routeId: sanitizeString(route.identity?.identifier || `route-${index}`, 50),
        driverName,
        vehicleType: sanitizeString(vehicleType, 50),
        totalDurationMinutes,
        travelTimeMinutes,
        serviceTimeMinutes,
        stopCount,
        totalWeight,
        vehicleCapacity,
        weightUtilization,
        timeUtilization,
        insights,
        rounds: rounds.length > 0 ? rounds : undefined,
        normalWorkDayMinutes,
      };
    });

    // Fetch weather data from Open-Meteo
    let weatherData: any = null;
    try {
      // Use coordinates for Israel (center point)
      const lat = 31.95;
      const lon = 35.19;
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia/Jerusalem&date=${sessionDate}`;
      const weatherResponse = await fetch(weatherUrl);
      if (weatherResponse.ok) {
        weatherData = await weatherResponse.json();
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch weather data');
      }
    }

    // Fetch holidays for Israel
    let isHoliday = false;
    let holidayName = '';
    try {
      const holidayUrl = `https://date.nager.at/api/v2/IsPublicHoliday?date=${sessionDate}&countryCode=IL`;
      const holidayResponse = await fetch(holidayUrl);
      if (holidayResponse.ok) {
        const holiday = await holidayResponse.json();
        isHoliday = holiday.isPublicHoliday === true;
        if (isHoliday) {
          holidayName = holiday.name || 'חג';
        }
      }
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Failed to fetch holiday data');
      }
    }

    // Calculate traffic insights based on route times and holidays
    const trafficInsights = calculateTrafficInsights(kpis, isHoliday, language);
    const summary = calculateDashboardSummary(kpis, normalWorkDayMinutes, sessionDate, weatherData, trafficInsights, isHoliday, holidayName, language);

    return NextResponse.json({
      routes: kpis,
      kpis,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Routes fetch error:', error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json(
      { error: 'Failed to fetch routes' },
      { status: 500 }
    );
  }
}
