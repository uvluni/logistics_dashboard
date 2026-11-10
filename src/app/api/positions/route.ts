import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rateLimiter';
import { sanitizeDriverName, sanitizeString } from '@/lib/sanitize';
import { buildPositions, gpsWindow } from '@/lib/driverPositions';

// GET /api/positions?sessionDate=yyyy-MM-dd            -> routes of the day (for the picker)
// GET /api/positions?sessionDate=yyyy-MM-dd&routeId=1005 -> where the driver was (truck GPS) at each
//     arrival / departure report of that route.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('roadnet_token')?.value;
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!(await checkRateLimit(token, 30, 60000))) {
      return NextResponse.json({ error: 'Rate limit exceeded. Maximum 30 requests per minute' }, { status: 429 });
    }
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!baseUrl) return NextResponse.json({ error: 'Missing API base URL' }, { status: 500 });

    const { searchParams } = new URL(request.url);
    const sessionDate = searchParams.get('sessionDate') || new Date().toISOString().split('T')[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return NextResponse.json({ error: 'Invalid sessionDate format. Use yyyy-MM-dd' }, { status: 400 });
    }
    const routeId = searchParams.get('routeId');
    if (routeId != null && !/^[\w.-]{1,30}$/.test(routeId)) {
      return NextResponse.json({ error: 'Invalid routeId' }, { status: 400 });
    }
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [y, m, d] = sessionDate.split('-').map(Number);
    const dayBefore = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const params = new URLSearchParams({ beginDate: `${dayBefore}T00:00:00`, endDate: `${sessionDate}T23:59:59`, expand: 'All', pageSize: '1000' });
    const res = await fetch(`${baseUrl}/v1/reports/routeactuals?${params}`, { headers, cache: 'no-store' });
    if (res.status === 401) return NextResponse.json({ error: 'Session expired' }, { status: 401 });
    if (!res.ok) return NextResponse.json({ error: `ROADNET error ${res.status}` }, { status: 502 });
    const items: any[] = ((await res.json()).items || []).filter((r: any) => !r.sessionIdentity?.date || r.sessionIdentity.date === sessionDate);

    if (!routeId) {
      const routes = items
        .map((r) => ({
          routeId: sanitizeString(r.identity?.identifier || '', 30),
          driverName: sanitizeDriverName(r.workersInfo?.[0]?.name?.firstName || ''),
          vehicle: sanitizeString(r.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.identifier || '', 50),
          reported: (r.stopActuals || []).some((s: any) => s.serviceableStopInfo?.arrivalTimestamp?.dataSource === 'AutoCaptured'),
        }))
        .sort((a, b) => a.routeId.localeCompare(b.routeId, 'he', { numeric: true }));
      return NextResponse.json({ sessionDate, routes }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const r = items.find((x) => x.identity?.identifier === routeId);
    if (!r) return NextResponse.json({ error: 'Route not found for this date' }, { status: 404 });

    // Truck GPS track around the route.
    const eqKey = r.equipmentInfo?.[0]?.specificEquipmentInfo?.identity?.entityKey;
    const w = gpsWindow(r);
    const positions: any[] = [];
    if (eqKey) {
      for (let page = 0; page < 20; page++) {
        const q = new URLSearchParams({ beginDate: w.begin, endDate: w.end, expand: 'All', pageSize: '1000', pageIndex: String(page) });
        const pr = await fetch(`${baseUrl}/v1/reports/equipmentpositions/${encodeURIComponent(String(eqKey))}?${q}`, { headers, cache: 'no-store' });
        if (!pr.ok) break;
        const list = (await pr.json()).items || [];
        positions.push(...list);
        if (list.length < 1000) break;
      }
    }

    const data = buildPositions(r, positions, sessionDate, null, null);
    return NextResponse.json(
      {
        ...data,
        driverName: sanitizeDriverName(data.driverName),
        vehicle: sanitizeString(data.vehicle, 50),
        depot: { ...data.depot, name: sanitizeString(data.depot.name, 120) },
        stops: data.stops.map((s) => ({
          ...s,
          customer: sanitizeString(s.customer, 120),
          city: sanitizeString(s.city, 60),
          events: s.events.map((e) => (e.orderId ? { ...e, orderId: sanitizeString(e.orderId, 40) } : e)),
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ error: 'Failed to load driver positions' }, { status: 500 });
  }
}
