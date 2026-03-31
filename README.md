# 智慧体检知识库引擎 V5.1

多人协作、云端永久保存的体检知识库管理平台。

## 功能模块

| 模块 | 功能 |
|---|---|
| 📚 全局标准库 | 导入/导出/新增/编辑/弃用规则，修改记录追踪 |
| 🏥 医院定制库 | 按医院覆写规则字段，支持批量 AI 修改建议 |
| 🌿 词根表 | 管理检查/检验词根映射，规则转写词条校验来源 |
| 🧪 逻辑沙盒 | 模拟引擎推演，验证规则触发效果 |

---

## 部署步骤（约 10 分钟）

### 第一步：创建 Firebase 项目（免费）

1. 访问 [Firebase Console](https://console.firebase.google.com)，用 Google 账号登录
2. 点击「新增专案」，填写项目名称（如 `health-kb`），点创建
3. 进入项目后，左侧菜单「构建」→「Realtime Database」
4. 点「创建数据库」，区域选 **亚洲**，规则选「以测试模式启动」（30天内任何人可读写）
5. 点击「规则」标签，将规则改为（永久允许已知用户读写，无需后端）：
   ```json
   {
     "rules": {
       ".read": true,
       ".write": true
     }
   }
   ```
   > ⚠️ 上线后建议改为更严格的规则，防止外部写入

6. 点击「项目设置」（左上角齿轮图标）→「您的应用」→ 点「</> Web」图标
7. 填写应用昵称，点「注册应用」，复制 `firebaseConfig` 对象中的所有值

### 第二步：填写配置文件

打开 `js/config.js`，将 `YOUR_xxx` 全部替换为第一步复制的值：

```javascript
window.FIREBASE_CONFIG = {
    apiKey:            "AIzaSy...",          // 从 Firebase 复制
    authDomain:        "health-kb.firebaseapp.com",
    databaseURL:       "https://health-kb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "health-kb",
    storageBucket:     "health-kb.appspot.com",
    messagingSenderId: "123456789",
    appId:             "1:123456789:web:abcdef"
};
```

### 第三步：上传到 GitHub

1. 在 GitHub 创建一个**新的公开仓库**（如 `health-knowledge-base`）
2. 将本文件夹内所有文件上传到该仓库（可直接拖拽上传，或用 Git）
3. 进入仓库「Settings」→「Pages」→ Source 选「GitHub Actions」
4. 回到仓库「Actions」标签，等待工作流跑完（约 1 分钟）
5. 工作流完成后，Pages 页面会显示你的网址，如：
   `https://你的用户名.github.io/health-knowledge-base/`

### 第四步：分享给团队

将网址发给所有使用者即可。所有人登录后的数据**实时同步**，任何修改对所有在线用户立即可见。

---

## 用户账号

账号在 `js/app.js` 的 `USERS` 数组中管理，可自行增删改：

```javascript
const USERS = [
    { username: 'admin', password: 'admin123', displayName: '系统管理员', avatarColor: '#2563eb' },
    { username: 'zhang', password: '123456',   displayName: '张主任',     avatarColor: '#16a34a' },
    { username: 'li',    password: '123456',   displayName: '李医生',     avatarColor: '#9333ea' },
];
```

---

## 文件结构

```
health-knowledge-base/
├── index.html                    # 主页面（HTML 结构）
├── css/
│   └── styles.css                # 自定义样式
├── js/
│   ├── config.js                 # ⚠️ Firebase 配置（需要填写）
│   └── app.js                    # 全部业务逻辑
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Pages 自动部署
└── README.md
```

---

## 数据存储

所有数据存储在 Firebase Realtime Database，结构如下：

```
/
├── globalRulesDB        全局规则库（数组）
├── hospitals            医院列表（数组）
├── allHospitalOverrides 医院定制覆写（对象）
└── wordRootsDB          词根表（数组）
```

数据永久保存在 Firebase 云端，免费额度：1 GB 存储，10 GB/月流量，足够内部团队长期使用。

---

## 常见问题

**Q: 多人同时编辑会冲突吗？**
A: Firebase 实时监听，某人保存后其他人的界面自动刷新显示最新数据。如果两人同时编辑同一条规则，后保存的人会覆盖先保存的版本（最后写入胜出）。

**Q: 数据会丢失吗？**
A: Firebase 有自动备份，数据不会丢失。可在 Firebase Console → Realtime Database → 「导出 JSON」手动备份。

**Q: 如何迁移旧数据？**
A: 在网页中先导入 Excel，数据会自动同步到云端。
