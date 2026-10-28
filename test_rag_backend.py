import urllib.request
import json

queries = [
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
    "What can I do on ChargeMate website?"
]

out_lines = []

for q in queries:
    data = json.dumps({'message': q}).encode('utf-8')
    req = urllib.request.Request('http://localhost:8080/api/ai/chat', data=data, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    res = json.loads(resp.read().decode('utf-8'))
    out_lines.append('=' * 70)
    out_lines.append(f'QUERY: {q}')
    out_lines.append(f"IS_RAG: {res.get('is_rag')}")
    out_lines.append(f"RETRIEVED SOURCES: {res.get('retrieved_sources')}")
    out_lines.append(f"TOOL EXECUTED: {res.get('tool_executed')}")
    out_lines.append(f"ACTION TYPE: {res.get('action_type')}")
    out_lines.append(f"QUICK REPLIES: {res.get('suggested_quick_replies')}")
    out_lines.append('REPLY:\n' + str(res.get('reply')))
    out_lines.append('')
    print(f"PASS: '{q[:40]}...' -> Sources: {len(res.get('retrieved_sources', []))} | Tool: {res.get('tool_executed')}")

with open('rag_results.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(out_lines))

print(f"\nAll {len(queries)} tests completed and saved to rag_results.txt!")
