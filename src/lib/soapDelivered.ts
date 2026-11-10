// Per-order "delivered" times (Task.QuantityInputTimestamp) for ONE route, from the RNA SOAP
// RoutingService. Only used by the driver-positions map, one request per map. The REST token
// is the SOAP SessionGuid. Same call as roadnet-plugin src/soap.ts (see roadnet-api-notes.md).

const SOAP_URLS = [
  'https://apex-prod-eu-routing02.eu.roadnet.com/Routing/RoutingService.svc',
  'https://apex-prod-eu-routing01.eu.roadnet.com/Routing/RoutingService.svc',
];
const SOAP_ACTION = '"http://roadnet.com/apex/IRoutingService/RetrieveRoutesByEntityKeys"';

const xmlEscape = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

function envelope(token: string, businessUnitKey: number, regionKey: number, routeKey: number) {
  return (
    `<s:Envelope xmlns:s='http://schemas.xmlsoap.org/soap/envelope/'><s:Header><h:SessionHeader xmlns:h='http://roadnet.com/apex/DataContracts/'>` +
    `<h:SessionGuid>${xmlEscape(token)}</h:SessionGuid></h:SessionHeader></s:Header><s:Body><RetrieveRoutesByEntityKeys xmlns='http://roadnet.com/apex/'>` +
    `<regionContext i:type='b:SingleRegionContext' xmlns:b='http://roadnet.com/apex/DataContracts/' xmlns:i='http://www.w3.org/2001/XMLSchema-instance'>` +
    `<b:BusinessUnitEntityKey>${businessUnitKey}</b:BusinessUnitEntityKey><b:RegionEntityKey>${regionKey}</b:RegionEntityKey></regionContext>` +
    `<entityKeys xmlns:a='http://schemas.microsoft.com/2003/10/Serialization/Arrays'><a:long>${routeKey}</a:long></entityKeys>` +
    `</RetrieveRoutesByEntityKeys></s:Body></s:Envelope>`
  );
}

// Value of a direct child element <a:Name>value</a:Name> (empty / nil -> null).
const field = (xml: string, name: string): string | null => {
  const m = xml.match(new RegExp(`<a:${name}(?:\\s[^>]*)?(?:/>|>([^<]*)</a:${name}>)`));
  const v = m?.[1]?.trim();
  return v ? v : null;
};

export async function deliveredTimes(
  baseUrl: string,
  token: string,
  routeKey: number,
  regionKey: number
): Promise<{ locationId: string; orderId: string; time: string | null }[]> {
  const regionsRes = await fetch(`${baseUrl}/v1/admin/regions?expand=All`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!regionsRes.ok) throw new Error(`regions ${regionsRes.status}`);
  const regions = (await regionsRes.json()).items || [];
  const region = regions.find((g: any) => Number(g.identity?.entityKey) === regionKey) || regions[0];
  const bu = Number(region?.businessUnit?.entityKey);
  if (!bu) throw new Error('no business unit');

  let xml = '';
  const errors: string[] = [];
  for (const url of SOAP_URLS) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: SOAP_ACTION },
      body: envelope(token, bu, regionKey, routeKey),
      cache: 'no-store',
    });
    const text = await res.text();
    if (res.ok && !/<(\w+:)?Fault>/.test(text)) {
      xml = text;
      break;
    }
    errors.push(`${new URL(url).host}: ${(text.match(/<faultstring[^>]*>([^<]*)/) || [])[1] || res.status}`);
  }
  if (!xml) throw new Error(`SOAP failed: ${errors.join(' | ')}`);

  const out: { locationId: string; orderId: string; time: string | null }[] = [];
  for (const m of xml.matchAll(/<a:StopAction>([\s\S]*?)<\/a:StopAction>/g)) {
    const action = m[1];
    const task = (action.match(/<a:Task>([\s\S]*?)<\/a:Task>/) || [])[1];
    if (!task) continue;
    out.push({
      locationId: field(task, 'LocationIdentifier') || '',
      orderId: field(action, 'OrderIdentifier') || '',
      time: field(task, 'QuantityInputTimestamp'),
    });
  }
  return out;
}
