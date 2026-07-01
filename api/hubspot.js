// api/hubspot.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'HUBSPOT_TOKEN not set' });

  const props = 'firstname,lastname,lead_stage,campaign,createdate,lastmodifieddate,notes_last_contacted,notes_last_updated';
  let all = [], after;

  try {
    while (true) {
      const url = new URL('https://api.hubapi.com/crm/v3/objects/contacts');
      url.searchParams.set('limit','100');
      url.searchParams.set('properties', props);
      if (after) url.searchParams.set('after', after);
      const r = await fetch(url.toString(), { headers:{ Authorization:`Bearer ${token}` }});
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const d = await r.json();
      all = all.concat(d.results || []);
      if (d.paging?.next?.after && all.length < 1000) after = d.paging.next.after;
      else break;
    }

    const contacts = all.map(c => ({
      id: c.id,
      name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || 'Unknown',
      leadStage: c.properties.lead_stage || null,
      campaign:  c.properties.campaign  || null,
      createdAt: c.properties.createdate || null,
      lastModified: c.properties.lastmodifieddate || null,
      lastContacted: c.properties.notes_last_contacted || null,
      lastActivity:  c.properties.notes_last_updated  || null,
    }));

    res.status(200).json({ lastUpdated: new Date().toISOString(), total: contacts.length, contacts });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
