const res = await fetch("http://127.0.0.1:19898/api/webchat/history?agent_id=marcus-aurelius&session_id=portal:chat:marcus-aurelius&limit=10");
const data = await res.json();
console.log(data);
