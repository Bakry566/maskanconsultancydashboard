// api/meta.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = process.env.META_TOKEN;
  const acct  = process.env.META_AD_ACCOUNT_ID || 'act_1430929428214791';
  if (!token) return res.status(500).json({ error: 'META_TOKEN not set' });

  try {
    // All-time stats
    const allUrl = `https://graph.facebook.com/v21.0/${acct}/campaigns`
      + `?fields=id,name,effective_status,start_time,delivery`
      + `,insights{spend,impressions,reach,clicks,ctr,cpm,cpc,frequency,actions,cost_per_action_type}`
      + `&date_preset=maximum&access_token=${token}`;

    // Today's stats
    const todayUrl = `https://graph.facebook.com/v21.0/${acct}/campaigns`
      + `?fields=id,name,effective_status`
      + `,insights.date_preset(today){spend,impressions,reach,clicks,ctr,cpm,frequency,actions,cost_per_action_type}`
      + `&access_token=${token}`;

    const [a, t] = await Promise.all([fetch(allUrl), fetch(todayUrl)]);
    const [ad, td] = await Promise.all([a.json(), t.json()]);

    // Build today map
    const todayMap = {};
    (td.data || []).forEach(c => {
      const ins = c.insights?.data?.[0];
      if (!ins) return;
      const spend = parseFloat(ins.spend || 0);
      const leads = parseInt(ins.actions?.find(x => x.action_type==='lead')?.value || 0);
      todayMap[c.id] = {
        spend, leads,
        ctr:  parseFloat(ins.ctr || 0),
        cpm:  parseFloat(ins.cpm || 0),
        freq: parseFloat(ins.frequency || 0),
        imp:  parseInt(ins.impressions || 0),
        reach:parseInt(ins.reach || 0),
        clicks:parseInt(ins.clicks || 0),
        cpl:  leads > 0 ? spend / leads : 0,
      };
    });

    const campaigns = (ad.data || []).map(c => {
      const ins = c.insights?.data?.[0];
      const spend  = parseFloat(ins?.spend || 0);
      const leads  = parseInt(ins?.actions?.find(x=>x.action_type==='lead')?.value || 0);
      const cplRaw = ins?.cost_per_action_type?.find(x=>x.action_type==='lead')?.value;
      const today  = todayMap[c.id] || null;

      // A campaign is truly "delivering" only if:
      // 1. It spent money today AND
      // 2. delivery substatus is "active" (not "completed")
      const deliveryStatus = c.delivery?.substatuses?.[0] || '';
      const isDelivering = (today?.spend > 0) && deliveryStatus === 'active';

      // Days running
      const daysRunning = c.start_time
        ? Math.max(1, Math.floor((Date.now()-new Date(c.start_time).getTime())/86400000))
        : null;

      // Daily avg spend
      const dailyAvg = daysRunning && spend > 0 ? spend / daysRunning : 0;

      // Frequency trajectory — days until 2.5x at current daily freq rate
      const allTimeFreq = parseFloat(ins?.frequency || 0);
      const dailyFreqRate = daysRunning > 0 ? allTimeFreq / daysRunning : 0;
      const daysToFatigue = dailyFreqRate > 0
        ? Math.max(0, Math.round((2.5 - allTimeFreq) / dailyFreqRate))
        : null;

      return {
        id: c.id,
        name: c.name,
        status: c.effective_status,
        isDelivering,
        startTime: c.start_time,
        daysRunning,
        dailyAvg: Math.round(dailyAvg),
        spend,
        leads,
        cpl: cplRaw ? parseFloat(cplRaw) : (leads > 0 ? spend/leads : 0),
        ctr:  parseFloat(ins?.ctr || 0),
        cpm:  parseFloat(ins?.cpm || 0),
        freq: parseFloat(ins?.frequency || 0),
        imp:  parseInt(ins?.impressions || 0),
        reach:parseInt(ins?.reach || 0),
        clicks:parseInt(ins?.clicks || 0),
        daysToFatigue,
        today,
      };
    });

    res.status(200).json({ lastUpdated: new Date().toISOString(), campaigns });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
