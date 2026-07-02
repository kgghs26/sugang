import { MongoClient, ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

function verify(req){
  const auth = req.headers.authorization || "";
  return jwt.verify(auth.replace("Bearer ", ""), process.env.JWT_SECRET);
}

export default async function handler(req, res){
  // ===== CORS 허용 =====
  res.setHeader("Access-Control-Allow-Origin", "https://kgghs26.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();  // preflight 응답
  // =====================
  
  // GET과 DELETE 이외의 메서드 차단
  if(req.method !== "GET" && req.method !== "DELETE")
    return res.status(405).json({ error: "Method not allowed" });

  let user;
  try{ user = verify(req); }
  catch{ return res.status(401).json({ error: "로그인이 필요합니다." }); }

  const { id } = req.query;
  if(!id || !ObjectId.isValid(id))
    return res.status(400).json({ error: "잘못된 ID입니다." });

  await client.connect();
  const col = client.db("sugang").collection("roadmaps");

  // 데이터 불러오기 (GET)
  if (req.method === "GET") {
    const rd = await col.findOne({ _id: new ObjectId(id), sid: user.sid });
    if(!rd) return res.status(404).json({ error: "로드맵을 찾을 수 없습니다." });
    return res.status(200).json(rd);
  }

  // 데이터 삭제 (DELETE)
  if (req.method === "DELETE") {
    const result = await col.deleteOne({ _id: new ObjectId(id), sid: user.sid });
    if (result.deletedCount === 0) return res.status(404).json({ error: "삭제할 로드맵을 찾을 수 없습니다." });
    return res.status(200).json({ ok: true });
  }
}
