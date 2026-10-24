# 班级选座系统

班级选座网站，基于 FastAPI + 原生 JavaScript 构建的学生选座管理平台。支持多轮选座、志愿填报、自动分配、数据加密备份等完整流程。

## 功能概述

### 教师端
- **首次配置向导**：自动引导完成教师密码设置、教室布局、导入名单
- **学生名单管理**：XLSX 智能导入（自动识别姓名/学号/成绩/排名/性别列）、导出座位表
- **多轮选座管理**：支持开启/完成多个选座轮次，每轮独立记录志愿和分配结果
- **教室布局配置**：自定义组数、排数、列数，支持禁用/启用座位
- **当场选座**：按成绩排名顺序逐个分配座位，支持同伴（同桌）分配、座位交换、撤销
- **志愿自动锁定**：按排名批量自动匹配学生志愿到座位
- **数据备份与恢复**：`.csc123` 加密备份文件导出/导入，支持密码保护，带 HMAC 防篡改签名
- **密码重置**：清除学生密码，下次登录时重新设置

### 学生端
- **登录**：输入姓名匹配学生身份（若重名，则需要手动修改名单使姓名不重复）
- **自主注册**：首次登录设置密码（至少 8 位，含字母和数字）
- **查看教室座位图**：可视化查看座位布局和已分配情况
- **提交座位志愿**：最多 10 个志愿，按优先级排序
- **查看分配结果**：选座完成后查看自己的座位

### 安全特性
- **认证**：JWT + HttpOnly Cookie，PBKDF2-HMAC-SHA256（60 万次迭代）密码哈希
- **CSRF 防护**：Double Submit Cookie 模式，状态变更操作需验证 Token
- **全站加密**：AES-256-GCM 加密敏感数据，SQLite 数据库文件落盘自动加密
- **速率限制**：登录指数退避锁定 + 全 API 请求频率限制
- **操作审计**：关键操作（导入/导出/重置/布局变更等）写入审计日志
- **安全响应头**：CSP、X-Content-Type-Options、X-Frame-Options、Referrer-Policy
- **防篡改**：导出数据带 HMAC-SHA256 签名，导入时自动校验
- **文件安全**：上传文件魔数校验、ZIP 炸弹防护、大小限制

## 技术栈

| 层 | 技术 |
|---|------|
| 后端框架 | FastAPI (Python 3.11+) |
| 数据库 | SQLite + SQLAlchemy ORM（WAL 模式） |
| 认证 | JWT (HttpOnly Cookie) + PBKDF2-HMAC-SHA256 密码哈希 |
| 加密 | AES-256-GCM（cryptography 库），含静态 DB 文件加密 |
| 前端 | 原生 HTML/CSS/JavaScript（无框架） |
| 拼音匹配 | pypinyin 库 |
| 表格处理 | openpyxl |
| 反向代理 | Nginx |
| 部署 | Docker Compose |

## 快速开始

### 前提条件

> [!WARNING]
> ## Docker 部署的注意事项
>
> Docker 部署方式存在以下问题，**实际使用时优先选择本地版**（本地版可在 [Releases](https://github.com/eric6227/class-seat-choose/releases) 页面获得）：
>
> ### 1. 境外服务器部署的法律风险
> 在境外（中国大陆以外）服务器上部署，涉及向境外提供境内自然人的个人信息，可能触犯以下法律：
> - **《个人信息保护法》**：向境外提供个人信息需满足特定条件（如通过数据出境安全评估、订立个人信息出境标准合同并备案、进行个人信息保护认证等）。
> - **《数据出境安全评估办法》**：学生选座场景若涉及人数达到一定规模或包含敏感信息，需要完成数据出境安全评估。
>
> 即便规模很小，作为信息处理者，你仍对境外接收方（境外服务器）处理学生信息的行为负有法律责任。学校作为数据控制方，其合规义务也不会因服务器在境外而豁免。
>
> ### 2. 国内服务器部署的额外成本
> 在中国大陆境内服务器部署，需要购买域名并完成 ICP 备案，增加了部署的时间和经济成本。
>
> ### 3. 校园服务器部署的限制
> 在校园内网服务器部署需要取得管理员同意，且当前版本暂不支持多班级管理，适用范围有限。
>
> **建议**：以上场景中，优先使用本地版程序，无需联网即可运行，避免上述所有问题。
>
> 本地版的使用方法见下方 [本地版使用方式](#本地版使用方式推荐)

- Docker 与 Docker Compose

### Docker Compose 部署（推荐）

```bash
# 1. 拉取仓库
git clone https://github.com/eric6227/class-seat-choose.git
cd class-seat-choose

# 2. 设置教师初始化令牌（必须）
# 方式A：命令行直接注入
export TEACHER_INIT_TOKEN=你的随机令牌
# 方式B：在项目目录下创建 .env 文件，写入：
cp .env.example .env
nano .env
# 在 nano 文本编辑器里修改：TEACHER_INIT_TOKEN=你的随机令牌

# 3. 构建并启动容器
docker compose up -d

# 4. 访问
# 前端: http://IP地址:8480
# 首次打开页面需输入上面设置的初始化令牌，才能设置教师密码
```
> [!CAUTION]
> 此处使用 HTTP 仅为演示，实际部署务必使用下面的方法配置 HTTPS ！

### 配置 HTTPS

部署到生产环境时，根据是否使用 1Panel 面板，选择不同的 HTTPS 配置方式。

#### 方式一：使用 1Panel + OpenResty（推荐）

如果你使用 1Panel 面板并通过 OpenResty 做反向代理，**无需修改本项目配置文件**，保持默认 HTTP 模式即可：

1. `frontend/nginx.docker.conf` 保持默认状态（HTTP 模式，监听 8480 端口）
2. `docker-compose.yml` 保持默认状态（映射 8480 端口）
3. 在 1Panel 面板的「网站」功能中创建站点，申请 Let's Encrypt 免费证书
4. 反向代理目标填写 `http://localhost:8480`
5. 云服务器安全组只需开放 443 端口，关闭 8480 端口

架构示意：

```
用户 → HTTPS → OpenResty(1Panel:443) → HTTP → Nginx(Docker:8480) → Backend(Docker:8481)
```

#### 方式二：不使用 OpenResty，由项目自带 Nginx 提供 HTTPS

如果未使用 1Panel/OpenResty，需要启用项目自带的 HTTPS 配置：

1. 将 `frontend/nginx.docker.conf` 中第 42-88 行的 HTTPS server 块取消注释
2. 注释或删除第 1-35 行的 HTTP server 块
3. 将 `your-domain.com` 替换为你的真实域名
4. 将 SSL 证书文件通过 Docker 卷挂载到容器内的对应路径
5. 修改 `docker-compose.yml`，将端口映射从 `8480:8480` 改为 `443:443`

架构示意：

```
用户 → HTTPS → Nginx(Docker:443) → HTTP → Backend(Docker:8481)
```

### 手动运行（备选方案，不推荐）

如果不使用 Docker，也可以直接运行：

```bash
# 1. 安装后端依赖
cd backend
pip install -r requirements.txt

# 2. 配置环境变量
cp ../.env.example ../.env
# 编辑项目根目录下的 .env 文件，将 TEACHER_INIT_TOKEN 的值改为你的令牌：
#   TEACHER_INIT_TOKEN=你的随机令牌
# 可选设置 SECRET_KEY 和 ENCRYPTION_KEY

# 3. 启动后端（默认端口 8481）
cd app
uvicorn main:app --host 0.0.0.0 --port 8481 --reload

# 4. 启动前端（使用任意静态文件服务器，或 nginx）
# 见 frontend/nginx.conf 配置
```

### 本地版使用方式（推荐）

从 [Releases](https://github.com/eric6227/class-seat-choose/releases) 页面下载 `ClassSeatChoose-local.zip`，解压后直接双击运行 `start.bat` 即可。

- 会自动跳转到浏览器并打开登录界面
- 初始化令牌：`admin123`
- 首次打开页面时输入以上初始化令牌，然后设置教师密码

> 本地版已内置 PyInstaller 打包的后端可执行文件，无需安装 Python 环境。所有数据存储在本地，无需联网。

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `TEACHER_INIT_TOKEN` | **是** | 无 | 教师初始化令牌，首次设置教师密码时需提供。未设置则拒绝初始化请求 |
| `SECRET_KEY` | 否 | 自动生成 | JWT 签名密钥，至少 32 字符。留空则自动生成并持久化到 `data/.secret_key` |
| `ENCRYPTION_KEY` | 否 | 自动生成 | AES-256 数据加密密钥。首次启动自动生成并持久化到 `data/.encryption_key` |
| `DATABASE_URL` | 否 | `sqlite:///./data/seat.db` | 数据库连接地址 |
| `CORS_ORIGINS` | 否 | `http://localhost:8480` | 允许的跨域来源（逗号分隔） |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 否 | `30` | JWT Token 过期时间（分钟） |
| `DEBUG` | 否 | `false` | 开启后启用 `/api/docs` Swagger 文档 |
| `MAX_UPLOAD_SIZE_MB` | 否 | `10` | XLSX/CSC123 上传大小限制（MB） |
| `COOKIE_SECURE` | 否 | `true` | Cookie Secure 标志，开发环境可设为 `false` |
| `LOGIN_MAX_ATTEMPTS` | 否 | `10` | 登录窗口期内最大失败次数 |
| `LOGIN_WINDOW_SECONDS` | 否 | `300` | 登录失败计数窗口（秒） |
| `LOGIN_LOCKOUT_SECONDS` | 否 | `900` | 超过限制后的锁定时长（秒） |
| `API_RATE_LIMIT` | 否 | `200` | 每窗口期内全 API 最大请求数 |
| `API_RATE_WINDOW` | 否 | `60` | API 速率限制窗口（秒） |
| `TRUSTED_PROXY_CIDRS` | 否 | `127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` | 受信任的代理 IP 段，用于正确获取客户端真实 IP |

## API 接口

### 认证 `/api/auth`

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/auth/check-setup` | 检查教师密码是否已设置 |
| POST | `/auth/setup` | 首次设置教师密码（需 `setup_token` 匹配 `TEACHER_INIT_TOKEN`） |
| POST | `/auth/teacher/login` | 教师登录 |
| POST | `/auth/student/login` | 学生登录 |
| POST | `/auth/student/register` | 学生注册（首次设置密码） |
| GET | `/auth/check-student/{name}` | 查询学生是否存在及密码状态 |
| GET | `/auth/me` | 获取当前用户信息 |
| POST | `/auth/logout` | 登出（清除 Cookie） |

### 座位管理 `/api/seats`

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| GET | `/seats/state` | 教师/学生 | 获取完整状态（座位、学生、配置） |
| GET | `/seats/students` | 教师/学生 | 获取学生列表 |
| GET | `/seats/students/names` | 教师/学生 | 获取学生姓名列表 |
| GET | `/seats/students/status` | 教师 | 获取学生状态（含密码/志愿统计） |
| POST | `/seats/students/reset-password` | 教师 | 重置学生密码 |
| POST | `/seats/assign` | 教师 | 分配座位（支持同伴分配） |
| POST | `/seats/swap` | 教师 | 交换两座位学生 |
| POST | `/seats/clear` | 教师 | 清除座位上学生 |
| POST | `/seats/next` | 教师 | 获取下一位待分配学生 |
| POST | `/seats/undo` | 教师 | 撤销上一步分配 |
| POST | `/seats/reset` | 教师 | 重置所有选座数据（需验证密码） |
| PUT | `/seats/state` | 教师 | 更新座位状态配置 |
| POST | `/seats/export` | 教师 | 导出 .csc123 加密备份 |
| GET | `/seats/export-xlsx` | 教师 | 导出座位表 XLSX |
| POST | `/seats/import` | 教师 | 导入 .csc123 备份 |
| POST | `/seats/import-xlsx` | 教师 | 导入学生名单 XLSX |
| POST | `/seats/clear-seats` | 教师 | 清空所有座位（需验证密码） |
| GET | `/seats/layout` | 教师 | 获取教室布局配置 |
| POST | `/seats/layout` | 教师 | 更新教室布局 |
| POST | `/seats/seats/{id}/toggle-disable` | 教师 | 禁用/启用座位 |
| POST | `/seats/undo-round` | 教师 | 撤销本轮所有选座 |
| POST | `/seats/reset-data` | 教师 | 重置所有数据（需验证密码） |
| POST | `/seats/auto-lock-wishes` | 教师 | 按排名自动锁定志愿 |
| POST | `/seats/seed-demo` | 教师 | 生成演示数据 |

### 志愿管理 `/api/seats`

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| GET | `/seats/wishes` | 教师 | 获取全部志愿 |
| GET | `/seats/wishes/{student_name}` | 学生/教师 | 获取指定学生志愿 |
| POST | `/seats/wishes/save` | 学生 | 保存志愿（最多 10 个） |

### 轮次管理 `/api/seats`

| 方法 | 路径 | 角色 | 说明 |
|------|------|------|------|
| GET | `/seats/rounds` | 教师/学生 | 获取所有轮次列表 |
| GET | `/seats/rounds/current` | 教师/学生 | 获取当前进行中的轮次 |
| POST | `/seats/rounds/start` | 教师 | 开启新选座轮次 |
| POST | `/seats/rounds/{id}/complete` | 教师 | 完成指定轮次 |
| PUT | `/seats/rounds/{id}` | 教师 | 更新轮次信息 |

## 数据安全设计

### 数据库静态加密
SQLite 数据库文件在落盘后自动使用 AES-256-GCM 加密存储为 `.db.enc` 文件。应用启动时解密到内存，关闭时重新加密。密钥由 `ENCRYPTION_KEY` 派生，通过 PBKDF2-HMAC-SHA256 进行密钥派生。

### 敏感数据加密
学生敏感信息（通过 `crypto.encrypt_data()` / `decrypt_data()` ）使用 AES-256-GCM 加密，带 AAD（附加认证数据）防止重放攻击。

### 导出文件安全
- `.csc123` 文件为 ZIP 压缩的 JSON，可选用密码进行 AES-256-GCM 加密
- 导出数据包含 HMAC-SHA256 签名，导入时自动校验防篡改
- 导入时进行 ZIP 炸弹检测（解压后最大 50MB）

### 密码策略
- 教师/学生密码：PBKDF2-HMAC-SHA256，60 万次迭代，随机盐
- 学生密码最低 8 位，必须包含字母和数字
- 登录失败指数退避延迟（2^N 秒，最高 60 秒）
- 密码变更后，旧的 JWT Token 自动失效

## 使用流程

### 教师首次使用
1. 访问系统 → 输入设置教师密码 → 进入配置向导
2. 引导步骤：确认密码 → 设置教室布局（组数×排数×列数）→ 上传 XLSX 名单
3. 导入完成后可开始选座管理

### XLSX 名单格式
上传的 Excel 文件第一行为表头，系统自动识别以下列名：
- **姓名**（必填）：学生姓名
- **总分/成绩**：用于排名
- **排名/名次**：如无总分，排名转换为分数
- **学号/编号**：可选
- **性别**：可选（男/女或1/0）

### 选座流程
1. 教师**开启新轮次** → 学生端激活志愿填报
2. 学生**提交志愿**（最多 10 个优先级座位）
3. 教师可选择**自动锁定志愿**（按排名批量匹配）或**当场选座**（逐个叫号）
4. 教师**完成轮次** → 系统自动备份数据
5. 可开启新一轮选座，重复上述流程

## 项目结构

```
class-seat-chose/
├── backend/                       # FastAPI 后端
│   ├── app/
│   │   ├── routers/
│   │   │   ├── auth.py            # 认证路由（登录/注册/注销/首次设置）
│   │   │   └── seats.py           # 座位/学生/志愿/轮次管理路由
│   │   ├── auth.py                # 认证核心逻辑（JWT/密码哈希/拼音匹配）
│   │   ├── config.py              # 配置管理（环境变量/密钥持久化）
│   │   ├── crypto.py              # AES-256-GCM 加密工具（数据/文件/密码加密）
│   │   ├── csrf.py                # CSRF Token 中间件（Double Submit Cookie）
│   │   ├── database.py            # 数据库连接/迁移/静态加密管理
│   │   ├── main.py                # FastAPI 应用入口
│   │   ├── models.py              # SQLAlchemy 数据模型（10 张表）
│   │   ├── ratelimit.py           # 登录频率限制 + 全 API 速率限制
│   │   ├── schemas.py             # Pydantic 请求/响应模型
│   │   └── audit.py               # 操作审计日志
│   ├── data/                      # 数据库文件、证书、自动备份
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/                      # 前端静态文件
│   ├── js/
│   │   ├── api.js                 # API 请求封装（CSRF/Session/错误处理）
│   │   ├── app.js                 # 通用工具函数
│   │   ├── classroom.js           # 教室座位图渲染
│   │   ├── common.js              # 公共 UI 组件
│   │   ├── login.js               # 登录页逻辑
│   │   ├── main.js                # 入口初始化/路由
│   │   ├── student.js             # 学生端逻辑
│   │   └── teacher.js             # 教师端逻辑
│   ├── css/
│   │   ├── common.css             # 公共样式
│   │   ├── classroom.css          # 教室座位图样式
│   │   ├── login.css              # 登录页样式
│   │   ├── modals.css             # 弹窗样式
│   │   ├── student.css            # 学生端样式
│   │   ├── style.css              # 旧版样式（兼容）
│   │   └── teacher.css            # 教师端样式
│   ├── login.html                 # 登录页
│   ├── teacher.html               # 教师端页面
│   ├── student.html               # 学生端页面
│   ├── student-manage.html        # 学生管理页面
│   ├── nginx.conf                 # Nginx 配置（本地开发）
│   ├── nginx.docker.conf          # Nginx 配置（Docker 部署）
│   └── Dockerfile
├── data/                          # 测试用 XLSX 文件
│   └── 班级3-成绩排名表.xlsx
├── docker-compose.yml
├── .env.example
├── .gitignore
└── LICENSE
```
## 声明

本项目的代码使用 AI 生成，可能存在安全漏洞，请谨慎部署。

## 许可证

MIT License