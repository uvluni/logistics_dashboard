// Excel downloads of a day's plan: routes, stops and orders. The xlsx library is loaded only when
// a report is downloaded. Column names stay in English: the files feed other systems.
import type { RouteKPI } from '@/types';

export class SessionExpiredError extends Error {}

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) throw new SessionExpiredError();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function writeSheet(rows: Record<string, unknown>[], sheet: string, widths: number[], file: string) {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, file);
}

const cleanAddress = (s: string | undefined) => (s || '').replace(/\s+/g, ' ').trim();
/** "2026-07-02T06:35:47.191" -> "06:35". */
const clock = (ts: string | undefined) => (ts?.match(/T(\d{2}):(\d{2})/) || []).slice(1, 3).join(':');

/** One row per routed stop (depots excluded), with the fields both stop reports share. */
function stopRows(data: any, date: string) {
  const routes: any[] = data.items || data.routes || data.data || [];
  return routes.flatMap((route) => {
    let n = 0;
    return (route.stops || [])
      .filter((s: any) => s.stopType === 'ServiceableStop')
      .map((s: any) => {
        n++;
        const info = s.serviceableStopInfo || {};
        const loc = info.locationInfo || {};
        const base = {
          'Route ID': route.identity?.identifier || '',
          'Session Date': date,
          'Worker First Name': route.workersInfo?.[0]?.name?.firstName || '',
          'Equipment Identifier': route.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier || '',
          'Location Identifier': loc.identity?.identifier || '',
          'Location Description': loc.description || '',
          'Address Line 1': cleanAddress(loc.address?.addressLine1),
          'State Or Province': loc.address?.stateOrProvince || '',
          'Stop Number': n,
          'Arrival Timestamp': clock(info.arrivalTimestamp),
          'Departure Timestamp': clock(info.departureTimestamp),
        };
        return { base, info };
      });
  });
}

export async function downloadRoutesReport(kpis: RouteKPI[], date: string) {
  const rows = kpis.map((k) => ({
    'Route ID': k.routeId,
    'Driver Name': k.driverName,
    'Vehicle Type': k.vehicleType,
    'Total Duration (min)': k.totalDurationMinutes,
    'Travel Time (min)': k.travelTimeMinutes,
    'Service Time (min)': k.serviceTimeMinutes,
    Stops: k.stopCount,
    Rounds: k.rounds?.length || 0,
    'Total Weight (kg)': k.totalWeight,
    'Vehicle Capacity (kg)': k.vehicleCapacity,
    'Weight Utilization (%)': k.weightUtilization,
    'Time Utilization (%)': k.timeUtilization,
    Insights: k.insights?.join('; ') || '',
  }));
  await writeSheet(rows, 'Routes', [12, 15, 15, 16, 14, 14, 8, 8, 14, 16, 16, 14, 40], `routes-report-${date}.xlsx`);
}

export async function downloadStopsReport(date: string) {
  const data = await fetchJson(`/api/stops?sessionDate=${encodeURIComponent(date)}`);
  const rows = stopRows(data, date).map(({ base, info }) => ({ ...base, 'Total Delivery Quantities': info.totalDeliveryQuantities?.[0] || 0 }));
  await writeSheet(rows, 'Stops', [15, 13, 15, 18, 18, 20, 18, 16, 12, 20, 20, 14], `stops-report-${date}.xlsx`);
}

export async function downloadOrdersReport(date: string) {
  const data = await fetchJson(`/api/stops?sessionDate=${encodeURIComponent(date)}`);
  const rows = stopRows(data, date).flatMap(({ base, info }) =>
    (info.orders || []).map((o: any) => ({ ...base, 'Order Identifier': o.identity?.identifier || '', 'Total Delivery Quantities': o.totalDeliveryQuantities?.[0] || 0 }))
  );
  await writeSheet(rows, 'Orders', [15, 13, 15, 18, 18, 20, 18, 16, 12, 20, 20, 18, 14], `orders-report-${date}.xlsx`);
}
