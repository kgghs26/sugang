import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const client = new MongoClient(process.env.MONGODB_URI);

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { sid, name, pw } = req.body;

  // 학번 + 이름 검증
  await client.connect();
  const db = client.db("sugang");
  const student = await db.collection("students").findOne({ sid, name });

  if (!student)
    return res.status(401).json({ error: "학번 또는 이름이 올바르지 않습니다." });

  // 비밀번호 처리
  if (!student.pw) {
    // 최초 로그인 → 입력한 비번 저장
    if (!pw)
      return res.status(400).json({ error: "최초 로그인 시 비밀번호를 설정해 주세요." });
    const hash = await bcrypt.hash(pw, 10);
    await db.collection("students").updateOne({ sid }, { $set: { pw: hash } });
  } else {
    // 기존 비번 검증
    const ok = await bcrypt.compare(pw || "", student.pw);
    if (!ok)
      return res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
  }

  // JWT 발급
  const token = jwt.sign(
    { sid: student.sid, name: student.name, role: student.role || "student" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  return res.status(200).json({ token, name: student.name, sid: student.sid });
}