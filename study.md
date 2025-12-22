## 开发与测试

```
npx wrangler dev
```

运行之后数据是在本地模拟

### 添加本地数据

当你运行 wrangler dev 或 vite ↗ 时，Miniflare 会自动创建资源的本地版本（比如 KV、D1 或 R2）。这意味着你不需要为每个服务手动设置单独的本地实例。然而，新创建的本地资源不会包含任何数据——你需要使用 Wrangler 命令，并带有 --local 标志来填充这些资源。对本地资源的更改不会影响生产数据。

https://developers.cloudflare.com/workers/development-testing/local-data/

1.  Wrangler CLI 填充数据
    1.1 KV 数据
    创建命名空间

    ```
    npx wrangler kv namespace create [NAMESPACE]
    ```

    [更多命令](https://developers.cloudflare.com/kv/reference/kv-commands/)
    添加单个

    ```
    npx wrangler kv key put <KEY> <VALUE> --binding=<NAMESPACE> --local
    ```

    批量添加

    ```
    npx wrangler kv bulk put <FILENAME.json> --binding=<BINDING> --local
    ```

    1.2 D1 数据

        创建数据库

        ```
        npx wrangler d1 create [NAME]
        ```

        [更多命令](https://developers.cloudflare.com/workers/wrangler/commands/#d1)
