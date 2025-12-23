# Hono Cloudflare Worker Template (Bun Edition)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/your-username/your-repo)
![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)

[English](#english) | [中文](#chinese)

---

<a id="english"></a>

## 🇬🇧 English

A modern, opinionated, high-performance serverless API template. Built with the **Bun** runtime and **Hono** framework, designed for **Cloudflare Workers**. It features a fully typed development experience with **Drizzle ORM**, **D1 Database**, **KV Storage**, and **Vite**.

### ✨ Features

- **⚡️ Bun & Hono**: Blazing fast runtime and lightweight web framework.
- **🛡️ Type-Safe**: End-to-end type safety with TypeScript and Drizzle ORM.
- **🗄️ Cloudflare D1**: Serverless SQL database (SQLite) integration.
- **🔑 Cloudflare KV**: Global low-latency key-value storage.
- **🚀 Vite Powered**: Instant server start and hot module replacement (HMR).
- **🔒 Auth Ready**: JWT-based authentication middleware pre-configured.
- **✅ Validation**: Zod integration for request schema validation.

### 🛠️ Prerequisites

- [Bun](https://bun.sh) (v1.0+)
- [Cloudflare Account](https://dash.cloudflare.com/)

### 🚀 Getting Started

#### 1. Use this Template

```bash
git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git) my-api
cd my-api
bun install
```

#### 2. Cloudflare Resource Setup

Before running the project, you need to create the D1 database and KV namespace on Cloudflare.

**Create D1 Database:**

```bash
bun x wrangler d1 create NAV

```

_Copy the `database_id` from the output and paste it into `wrangler.jsonc` under `d1_databases`._

**Create KV Namespace:**

```bash
bun x wrangler kv:namespace create NAV_KV

```

_Copy the `id` from the output and paste it into `wrangler.jsonc` under `kv_namespaces`._

#### 3. Environment Variables

Create a `.dev.vars` file (for local development) based on your needs:

```bash
# .dev.vars
JWT_SECRET=your_super_secret_key_for_local_dev

```

_Note: For production, set secrets using `bun x wrangler secret put JWT_SECRET`._

### 💻 Development

Start the development server with hot reload:

```bash
bun run dev

```

Or run in a simulation of the Cloudflare Workers environment:

```bash
bun run dev:cf

```

### 🗄️ Database Management

Managed via **Drizzle Kit**.

- **Generate Migrations**: Create SQL files from schema changes.

```bash
bun run db:generate

```

- **Local Migration**: Apply changes to local `.sqlite` file (simulated D1).

```bash
bun run db:migrate:local

```

- **Remote Migration**: Apply changes to production D1 database.

```bash
bun run db:migrate:remote

```

### 🚢 Deployment

Deploy your worker to Cloudflare's global network:

```bash
bun run deploy

```

### 📂 Project Structure

```text
├── drizzle/                # SQL migration files (auto-generated)
├── src/
│   ├── db/                 # Drizzle client & schema definitions
│   ├── middleware/         # Hono middleware (Auth, Logger, etc.)
│   ├── routes/             # API Route handlers (Controllers)
│   ├── services/           # Business logic layer
│   ├── types/              # Shared TypeScript types
│   ├── utils/              # Helper functions
│   └── index.tsx           # Application entry point
├── wrangler.jsonc          # Cloudflare configuration
└── drizzle.config.ts       # Drizzle Kit configuration

```

---

<a id="chinese"></a>

## 🇨🇳 中文文档

这是一个基于 **Bun** 运行时和 **Hono** 框架构建的现代化高性能 Serverless API 模板。它专为 **Cloudflare Workers** 打造，集成了 **D1** (SQL 数据库)、**KV** (键值存储)、**Drizzle ORM** 和 **Vite**，提供极致的开发体验。

### ✨ 核心特性

- **⚡️ 极速体验**: 采用 Bun 运行时和 Hono 框架，启动快，体积小。
- **🛡️ 类型安全**: 全链路 TypeScript 支持，配合 Drizzle ORM 实现数据库操作的类型安全。
- **🗄️ D1 数据库**: 内置 Cloudflare D1 (Serverless SQLite) 配置。
- **🔑 KV 存储**: 集成 Cloudflare KV 分布式键值存储。
- **🚀 Vite 驱动**: 支持本地开发环境的毫秒级热更新 (HMR)。
- **🔒 身份验证**: 预置基于 JWT 的身份验证中间件。
- **✅ 参数校验**: 集成 Zod 进行请求参数的自动验证。

### 🛠️ 前置要求

- 安装 [Bun](https://bun.sh) (v1.0 以上)
- 拥有一个 [Cloudflare 账户](https://dash.cloudflare.com/)

### 🚀 快速开始

#### 1. 获取项目

```bash
git clone [https://github.com/your-username/your-repo-name.git](https://github.com/your-username/your-repo-name.git) my-api
cd my-api
bun install

```

#### 2. 配置 Cloudflare 资源

在运行项目之前，你需要通过命令行为项目创建 D1 数据库和 KV 空间。

**创建 D1 数据库:**

```bash
bun x wrangler d1 create NAV

```

_执行后，复制终端输出的 `database_id`，替换 `wrangler.jsonc` 文件中 `d1_databases` 下的对应字段。_

**创建 KV 命名空间:**

```bash
bun x wrangler kv:namespace create NAV_KV

```

_执行后，复制终端输出的 `id`，替换 `wrangler.jsonc` 文件中 `kv_namespaces` 下的对应字段。_

#### 3. 环境变量配置

在项目根目录创建 `.dev.vars` 文件（用于本地开发），填入必要的环境变量：

```bash
# .dev.vars
JWT_SECRET=随便写一个用于本地开发的密钥

```

_注意：生产环境的密钥请使用 `bun x wrangler secret put JWT_SECRET` 命令设置。_

### 💻 开发命令

启动本地开发服务器（支持热更新）：

```bash
bun run dev

```

或者使用 Wrangler 模拟真实的 Worker 环境运行：

```bash
bun run dev:cf

```

### 🗄️ 数据库管理

本项目使用 **Drizzle Kit** 管理数据库变更。

- **生成迁移文件**: 根据 `schema.ts` 的变动生成 SQL 文件。

```bash
bun run db:generate

```

- **本地迁移**: 将变更应用到本地的模拟数据库中。

```bash
bun run db:migrate:local

```

- **远程迁移**: 将变更应用到 Cloudflare 生产环境的 D1 数据库。

```bash
bun run db:migrate:remote

```

### 🚢 部署上线

一键部署到 Cloudflare Workers：

```bash
bun run deploy

```

### 📂 目录结构说明

```text
├── drizzle/                # 数据库迁移记录文件 (自动生成)
├── src/
│   ├── db/                 # 数据库连接实例及 Schema 表定义
│   ├── middleware/         # Hono 中间件 (如 Auth鉴权, 日志)
│   ├── routes/             # 路由处理层 (Controller)
│   ├── services/           # 业务逻辑层 (Service)
│   ├── types/              # TypeScript 类型定义
│   ├── utils/              # 通用工具函数
│   └── index.tsx           # 应用入口文件
├── wrangler.jsonc          # Cloudflare Workers 配置文件
└── drizzle.config.ts       # Drizzle Kit 配置文件

```

### 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
