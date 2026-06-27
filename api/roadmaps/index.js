import { MongoClient } from "mongodb";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

function verify(req) {
  const auth = req.headers.authorization || "";
  return jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
}

export default async function handler(req, res) {
  // ===== CORS 허용 =====
  res.setHeader("Access-Control-Allow-Origin", "https://csolutn.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();  // preflight 응답
  // =====================
  let user;
  try { user = verify(req); }
  catch { return res.status(401).json({ error: "로그인이 필요합니다." }); }

  await client.connect();
  const col = client.db("sugang").collection("roadmaps");

  // 내 로드맵 목록
  if (req.method === "GET") {
    const list = await col
      .find({ sid: user.sid }, { projection: { name: 1, savedAt: 1 } })
      .sort({ savedAt: -1 }).toArray();
    return res.status(200).json(list);
  }

  // 저장 (덮어쓰기)
  if (req.method === "POST") {
    const { name, selections, isComplete } = req.body;
    if (!isComplete)
      return res.status(400).json({ error: "모든 조건을 충족해야 저장할 수 있습니다." });
    await col.updateOne(
      { sid: user.sid, name },
      { $set: { sid: user.sid, name, selections, isComplete, savedAt: new Date() } },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  }


  return res.status(405).json({ error: "Method not allowed" });
}