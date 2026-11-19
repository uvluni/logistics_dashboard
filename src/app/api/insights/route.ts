import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';
import { effectiveMode } from '@/lib/aiMode';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('roadnet_token')?.value;

    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Rate limiting: 10 requests per minute per token
    if (!checkRateLimit(token, 10, 60000)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { routesData, language = 'en', stopsData } = body;

    if (!routesData || !Array.isArray(routesData)) {
      return NextResponse.json(
        { error: 'Invalid routesData: must be an array of routes' },
        { status: 400 }
      );
    }

    // Analyze stops data if provided
    let stopsAnalysis = '';
    if (stopsData && Array.isArray(stopsData)) {
      stopsAnalysis = generateStopsAnalysis(stopsData, language);
    }

    // Low and no-AI modes: the insights are computed here by rules, and nothing is sent to the AI.
    // (Even low AI mode: the AI may read a question, never ROADNET data.)
    const aiMode = effectiveMode(body.aiMode);

    // Prepare prompt for Claude API
    const prompt = generatePrompt(routesData, language, stopsAnalysis);

    // Call Claude API
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || aiMode !== 'full') {
      // Fallback: Generate insights locally
      const insights = generateLocalInsights(routesData, language, stopsAnalysis);
      return NextResponse.json({
        success: true,
        insights: insights,
        generatedAt: new Date().toISOString(),
        source: 'local',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    if (process.env.NODE_ENV !== 'production') {
      console.log('[Insights] Calling Claude API');
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text();
      if (process.env.NODE_ENV !== 'production') {
        console.error('[Insights] Claude API error:', claudeResponse.status, errorText.substring(0, 200));
      }
      return NextResponse.json(
        { error: `Claude API error: ${claudeResponse.status}` },
        { status: 500 }
      );
    }

    const claudeData = await claudeResponse.json();
    const insights = claudeData.content?.[0]?.text || '';

    return NextResponse.json({
      success: true,
      insights: insights.trim(),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Insights generation error:', error instanceof Error ? error.message : String(error));
    }
    return NextResponse.json(
      { error: 'Failed to generate insights' },
      { status: 500 }
    );
  }
}

function generateStopsAnalysis(stopsData: any[], language: string): string {
  if (!stopsData || stopsData.length === 0) {
    return '';
  }

  const isHebrew = language === 'he';
  const isSpanish = language === 'es';

  // Analyze stops data with geographic insights
  let totalStops = 0;
  let emptyStops = 0;
  let lowDeliveryStops: any[] = [];
  let highDeliveryStops: any[] = [];
  const routeStops: Record<string, any[]> = {};
  const routeEmptyStops: Record<string, number> = {};
  const routeDeliveryQty: Record<string, number> = {};
  const cityStops: Record<string, any[]> = {};
  const singleStopRoutes: any[] = [];

  stopsData.forEach((stop) => {
    totalStops++;
    const routeId = stop['Route ID'] || 'Unknown';
    const qty = stop['Total Delivery Quantities'] || 0;
    const city = stop['City'] || stop['Address'] || 'Unknown';
    const description = stop['Location Description'] || '';

    // Track by route
    if (!routeStops[routeId]) routeStops[routeId] = [];
    routeStops[routeId].push(stop);

    routeDeliveryQty[routeId] = (routeDeliveryQty[routeId] || 0) + qty;

    // Track by city
    if (!cityStops[city]) cityStops[city] = [];
    cityStops[city].push({ routeId, qty, description });

    if (!qty || qty === 0) {
      emptyStops++;
      routeEmptyStops[routeId] = (routeEmptyStops[routeId] || 0) + 1;
    } else if (qty < 5) {
      lowDeliveryStops.push({ routeId, qty, city, description });
    } else if (qty >= 20) {
      highDeliveryStops.push({ routeId, qty, city, description });
    }
  });

  // Find single-stop routes
  Object.entries(routeStops).forEach(([routeId, stops]) => {
    if (stops.length === 1) {
      singleStopRoutes.push({
        routeId,
        city: stops[0]['City'] || stops[0]['Address'],
        qty: stops[0]['Total Delivery Quantities'],
      });
    }
  });

  const maxStopsPerRoute = Math.max(...Object.values(routeStops).map(r => r.length));
  const minStopsPerRoute = Math.min(...Object.values(routeStops).map(r => r.length));
  const avgQtyPerStop = (Object.values(routeDeliveryQty).reduce((a, b) => a + b, 0) / totalStops).toFixed(1);

  // Find cities with multiple stops that could be consolidated
  const citiesWithMultipleStops = Object.entries(cityStops)
    .filter(([city, stops]) => stops.length > 1 && city !== 'Unknown')
    .map(([city, stops]) => ({
      city,
      stopCount: stops.length,
      routeIds: [...new Set(stops.map(s => s.routeId))],
      totalQty: stops.reduce((sum, s) => sum + s.qty, 0),
    }))
    .sort((a, b) => b.stopCount - a.stopCount)
    .slice(0, 3);

  // Find optimization opportunities
  const optimizations: string[] = [];
  if (singleStopRoutes.length > 2) {
    const sameCityRoutes = singleStopRoutes.filter(r => r.city === singleStopRoutes[0].city);
    if (sameCityRoutes.length > 1) {
      optimizations.push(
        isHebrew
          ? `${sameCityRoutes.length} מסלולים בודדים בעיר "${singleStopRoutes[0].city}" - שקול לצרפם למסלול אחד`
          : `${sameCityRoutes.length} single-stop routes in "${singleStopRoutes[0].city}" - consider consolidating`
      );
    }
  }

  if (citiesWithMultipleStops.length > 0) {
    citiesWithMultipleStops.forEach(cityInfo => {
      if (cityInfo.routeIds.length > 1) {
        optimizations.push(
          isHebrew
            ? `עיר "${cityInfo.city}": ${cityInfo.stopCount} תחנות בחלוקה בין ${cityInfo.routeIds.length} מסלולים - בדוק אפשרות לאחוד`
            : `City "${cityInfo.city}": ${cityInfo.stopCount} stops spread across ${cityInfo.routeIds.length} routes - check consolidation`
        );
      }
    });
  }

  const routesWithManyEmptyStops = Object.entries(routeEmptyStops)
    .filter(([_, count]) => count >= 2)
    .length;

  if (isHebrew) {
    return `📍 תובנות נוספות מניתוח דו"ח התחנות:

🚨 בעיות וסיכויי שיפור:
• ${emptyStops} תחנות ללא הזמנות (עלות עודפת - סה"כ ${(emptyStops * 100 / totalStops).toFixed(1)}%)
• ${singleStopRoutes.length} מסלולים עם תחנה בודדת בלבד (סיכוי לאחוד)
• ${routesWithManyEmptyStops} מסלולים עם 2+ תחנות ריקות
• ${lowDeliveryStops.length} תחנות עם < 5 יחידות הזמנה (ניתן לאחד)

📊 סטטיסטיקות ניתוח:
• סך הכל תחנות: ${totalStops}
• ממוצע הזמנות לתחנה: ${avgQtyPerStop} יחידות
• טווח תחנות למסלול: ${minStopsPerRoute}-${maxStopsPerRoute}

🎯 הזדמנויות לשיפור בתכנון:
${optimizations.length > 0
  ? optimizations.map(o => `• ${o}`).join('\n')
  : '• אין בעיות ברורות - התכנון נראה אופטימלי'
}

💡 המלצות כללי:
• הזמנות קטנות: שקול לאחד ${lowDeliveryStops.length} תחנות עם הזמנות < 5 יחידות למסלולים סמוכים
• תחנות ריקות: בדוק ${emptyStops} תחנות ללא הזמנות - האם הן צריכות להיות בתכנון?
• מסלולים בודדים: ${singleStopRoutes.length} מסלולים עם תחנה בודדת - אפשר לתוספת מ"ל סמוכות`;
  }

  if (isSpanish) {
    return `📍 Información geográfica y de optimización del análisis de paradas:

🚨 Problemas y oportunidades de consolidación:
• ${emptyStops} paradas sin pedidos (costo desperdiciado - ${(emptyStops * 100 / totalStops).toFixed(1)}% del total)
• ${singleStopRoutes.length} rutas de parada única (potencial de consolidación)
• ${routesWithManyEmptyStops} rutas con 2+ paradas vacías
• ${lowDeliveryStops.length} paradas con < 5 unidades (se pueden fusionar)

📊 Estadísticas de análisis:
• Total de paradas: ${totalStops}
• Promedio de pedidos por parada: ${avgQtyPerStop} unidades
• Rango de paradas por ruta: ${minStopsPerRoute}-${maxStopsPerRoute}

🎯 Oportunidades de optimización:
${optimizations.length > 0
  ? optimizations.map(o => `• ${o}`).join('\n')
  : '• Sin problemas de consolidación mayor - la planificación parece optimizada'
}

💡 Recomendaciones generales:
• Paradas de bajo volumen: Consolidar ${lowDeliveryStops.length} paradas con < 5 unidades en rutas cercanas
• Paradas vacías: Revisar ${emptyStops} paradas sin pedidos - ¿deberían estar en el plan?
• Rutas de parada única: ${singleStopRoutes.length} rutas con 1 parada - agregar clientes cercanos`;
  }

  return `📍 Geographic & Optimization Insights from Stops Analysis:

🚨 Issues & Consolidation Opportunities:
• ${emptyStops} stops with no orders (wasted cost - ${(emptyStops * 100 / totalStops).toFixed(1)}% of total)
• ${singleStopRoutes.length} single-stop routes (consolidation potential)
• ${routesWithManyEmptyStops} routes with 2+ empty stops
• ${lowDeliveryStops.length} stops with < 5 units (can be merged)

📊 Analysis Statistics:
• Total stops: ${totalStops}
• Average orders per stop: ${avgQtyPerStop} units
• Route stops range: ${minStopsPerRoute}-${maxStopsPerRoute}

🎯 Optimization Opportunities:
${optimizations.length > 0
  ? optimizations.map(o => `• ${o}`).join('\n')
  : '• No major consolidation issues - planning appears optimized'
}

💡 General Recommendations:
• Low-qty stops: Consolidate ${lowDeliveryStops.length} stops with < 5 units into nearby routes
• Empty stops: Review ${emptyStops} stops with no orders - should they be in the plan?
• Single-stop routes: ${singleStopRoutes.length} routes with 1 stop - add nearby customers`;
}

function generateLocalInsights(routesData: any[], language: string, stopsAnalysis: string = ''): string {
  if (!routesData || routesData.length === 0) {
    if (language === 'he') return 'אין נתונים לניתוח';
    if (language === 'es') return 'Sin datos para analizar';
    return 'No data to analyze';
  }

  const isHebrew = language === 'he';
  const isSpanish = language === 'es';

  // Calculate metrics
  let totalWeight = 0;
  let totalCapacity = 0;
  let totalTime = 0;
  let maxTime = 0;
  let lowUtilization = 0;
  let highUtilization = 0;

  routesData.forEach((route) => {
    const weight = parseFloat(route['Weight Utilization (%)']) || 0;
    totalWeight += weight;
    totalCapacity += 100;
    totalTime += parseFloat(route['Total Duration (min)']) || 0;
    maxTime = Math.max(maxTime, parseFloat(route['Total Duration (min)']) || 0);

    if (weight < 50) lowUtilization++;
    if (weight > 85) highUtilization++;
  });

  const avgWeight = (totalWeight / routesData.length).toFixed(1);
  const avgTime = (totalTime / routesData.length).toFixed(0);

  if (isHebrew) {
    return `📊 ניתוח תכנון הפצה - ${new Date().toLocaleDateString('he-IL')}

🔍 סיכום כללי:
• מספר מסלולים: ${routesData.length}
• ניצול משקל ממוצע: ${avgWeight}%
• זמן עבודה ממוצע: ${avgTime} דקות
• זמן עבודה מקסימום: ${maxTime} דקות

⚠️ בעיות שזוהו:
• ${lowUtilization} מסלולים עם ניצול נמוך (< 50%)
• ${highUtilization} מסלולים עם ניצול גבוה (> 85%)

💡 המלצות:
• שקול לשלב מסלולים עם ניצול נמוך כדי לשפר יעילות
• בדוק אם ניתן להוסיף עוד תחנות למסלולים קטנים
• אם זמן העבודה חורג מ-9 שעות, קחו בחשבון חלוקה לשני מסלולים
• הקפד על הפרוצדורות של חברה בתכנון

${stopsAnalysis}

🔬 שיטת החישוב:
• ניצול משקל = סכום ניצול משקל כל מסלול / מספר המסלולים
• בעיות זוהו על סמך סף של 50% ו-85% ניצול
• זמן עבודה ממוצע חושב מהעמודה "Total Duration (min)" בדוח`;
  }

  if (isSpanish) {
    return `📊 Análisis de planificación de distribución - ${new Date().toLocaleDateString('es-ES')}

🔍 Resumen:
• Número de rutas: ${routesData.length}
• Promedio de utilización de peso: ${avgWeight}%
• Tiempo de trabajo promedio: ${avgTime} minutos
• Tiempo de trabajo máximo: ${maxTime} minutos

⚠️ Problemas identificados:
• ${lowUtilization} rutas con utilización baja (< 50%)
• ${highUtilization} rutas con utilización alta (> 85%)

💡 Recomendaciones:
• Considere combinar rutas con bajo uso para mejorar la eficiencia
• Verifique si se pueden agregar más paradas a rutas más pequeñas
• Si el tiempo de trabajo excede 9 horas, considere dividir en dos rutas
• Revise los procedimientos de la empresa para planificación de rutas
• Supervise la retroalimentación del conductor sobre la eficiencia de ruta

${stopsAnalysis}

🔬 Método de cálculo:
• Utilización de peso = suma de utilización de peso de todas las rutas / número de rutas
• Problemas identificados basados en umbrales: < 50% (bajo) y > 85% (alto)
• Tiempo de trabajo promedio calculado desde la columna "Total Duration (min)" en el informe`;
  }

  return `📊 Distribution Planning Analysis - ${new Date().toLocaleDateString('en-US')}

🔍 Summary:
• Number of routes: ${routesData.length}
• Average weight utilization: ${avgWeight}%
• Average work time: ${avgTime} minutes
• Maximum work time: ${maxTime} minutes

⚠️ Issues Identified:
• ${lowUtilization} routes with low utilization (< 50%)
• ${highUtilization} routes with high utilization (> 85%)

💡 Recommendations:
• Consider combining routes with low utilization to improve efficiency
• Check if additional stops can be added to smaller routes
• If work time exceeds 9 hours, consider splitting into two routes
• Review company procedures for route planning
• Monitor driver feedback on route efficiency

${stopsAnalysis}

🔬 Calculation Method:
• Weight utilization = sum of all routes' weight utilization / number of routes
• Issues identified based on thresholds: < 50% (low) and > 85% (high)
• Average work time calculated from "Total Duration (min)" column in report`;
}

function generatePrompt(routesData: any[], language: string, stopsAnalysis: string = ''): string {
  const routesSummary = routesData
    .slice(0, 10)
    .map((route, idx) => {
      return `
Route ${idx + 1}:
- Route ID: ${route['Route ID'] || 'N/A'}
- Driver: ${route['Driver Name'] || 'N/A'}
- Vehicle: ${route['Vehicle Type'] || 'N/A'}
- Total Duration: ${route['Total Duration (min)'] || 0} min
- Travel Time: ${route['Travel Time (min)'] || 0} min
- Service Time: ${route['Service Time (min)'] || 0} min
- Stops: ${route['Stops'] || 0}
- Weight Utilization: ${route['Weight Utilization (%)'] || 0}%
- Time Utilization: ${route['Time Utilization (%)'] || 0}%`;
    })
    .join('\n');

  const isHebrew = language === 'he';
  const isSpanish = language === 'es';

  if (isHebrew) {
    return `אתה מנתח תכנון הפצה מקצועי. בדוק את הנתונים הבאים של מסלולים וספק 3-4 פסקאות קצרות ומעשיות:

${routesSummary}

אנא ספק:
1. סיכום כללי של יעילות ההפצה
2. 2-3 בעיות עיקריות שצריך לטפל בהן
3. המלצות מעשיות לשיפור הנתוב

כתוב בעברית, בצורה פשוטה וישירה.`;
  }

  if (isSpanish) {
    return `Eres un analista profesional de planificación de distribución. Analiza los siguientes datos de rutas y proporciona 3-4 párrafos cortos y prácticos:

${routesSummary}

Por favor proporciona:
1. Resumen general de la eficiencia de distribución
2. 2-3 problemas clave a abordar
3. Recomendaciones prácticas para optimizar las rutas

Escribe en español, de manera clara y directa.`;
  }

  return `You are a professional distribution planning analyst. Analyze the following route data and provide 3-4 short, practical paragraphs:

${routesSummary}

Please provide:
1. Overall efficiency summary
2. 2-3 key issues to address
3. Practical recommendations for route optimization

Write in clear, concise language focusing on actionable insights.`;
}
