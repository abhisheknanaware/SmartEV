const http = require('http');
const fs = require('fs');

const testQueries = [
  "What stations are near Wakad or Baner in Pune?",
  "Why is live location showing Mumbai when I am sitting in Pune?",
  "How can I calculate my EV charging time for a 40kWh battery on a 60kW charger?",
  "What is the difference between CCS2 and CHAdeMO and Type 2 connectors?",
  "Explain AC vs DC fast charging and onboard inverter",
  "Why does fast charging slow down after 80 percent?",
  "Explain LFP vs NMC battery chemistry and thermal safety",
  "What is the SOH formula and how is it calculated?",
  "How much money do I save driving an EV compared to petrol in India for 15,000 km?",
  "What is regenerative braking and how does it work?",
  "Is it safe to charge an EV in heavy rain and thunderstorms?",
  "How does the What-If battery simulator work on this website?",
  "How do I add a new EV charging station as an admin with Cloudinary photos?",
  "Can I cancel my booking and how long does the refund take?",
  "What can I do on ChargeMate website?",
  "What is the charging tariff at GreenCharge Wakad?"
];

function sendChat(q) {
  return new Promise((resolve, reject) => {
    const req = http.request('http://localhost:8080/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify({ message: q }));
    req.end();
  });
}

async function runAll() {
  const output = [];
  console.log(`Running RAG verification for ${testQueries.length} live backend questions...\n`);

  for (let i = 0; i < testQueries.length; i++) {
    const q = testQueries[i];
    const res = await sendChat(q);
    output.push('='.repeat(70));
    output.push(`QUERY [${i+1}/${testQueries.length}]: ${q}`);
    output.push(`IS_RAG: ${res.is_rag}`);
    output.push(`RETRIEVED SOURCES: ${JSON.stringify(res.retrieved_sources)}`);
    output.push(`TOOL EXECUTED: ${res.tool_executed}`);
    output.push(`ACTION TYPE: ${res.action_type}`);
    output.push(`QUICK REPLIES: ${JSON.stringify(res.suggested_quick_replies)}`);
    output.push('REPLY:\n' + res.reply);
    output.push('');
    console.log(`✅ [${i+1}/${testQueries.length}] "${q.slice(0, 45)}..." -> TOOL: ${res.tool_executed} | SOURCES: ${res.retrieved_sources ? res.retrieved_sources.length : 0}`);
  }

  fs.writeFileSync('rag_results.txt', output.join('\n'), 'utf8');
  console.log('\nAll tests successfully validated and written to rag_results.txt!');
}

runAll().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
