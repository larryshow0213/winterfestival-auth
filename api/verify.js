const admin = require('firebase-admin');

// 🛡️ 防止 Serverless 函式重複初始化導致開服報錯
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Firebase 初始化失敗，請檢查環境變數！", error);
  }
}

const db = admin.firestore();

module.exports = async (req, res) => {
  // 強制設定回傳為純文字，避免 Java 插件判斷失誤
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const key = req.query.key ? req.query.key.trim() : '';
  const uuid = req.query.uuid ? req.query.uuid.trim() : '';
  
  // Vercel 專用：聰明抓取經過反向代理後的服主真實 IP
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (!key || !uuid) {
    return res.status(200).send("INVALID_REQUEST");
  }

  try {
    const docRef = db.collection('licenses').doc(key);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(200).send("INVALID_KEY");
    }

    const data = doc.data();

    if (data.status === 'SUSPENDED') {
      return res.status(200).send("SUSPENDED");
    }
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return res.status(200).send("EXPIRED");
    }

    if (!data.server_ip || !data.server_uuid) {
      // 首次啟動：自動死綁該機器的 IP 與 UUID
      await docRef.update({
        server_ip: ip,
        server_uuid: uuid
      });
      return res.status(200).send("SUCCESS");
    } else {
      // 驗證比對：防拷貝與防外流
      if (data.server_uuid !== uuid) {
        return res.status(200).send("UUID_MISMATCH");
      }
      if (data.server_ip !== ip) {
        return res.status(200).send("IP_MISMATCH");
      }
      return res.status(200).send("SUCCESS");
    }
  } catch (error) {
    return res.status(200).send("ERROR_DB");
  }
};
