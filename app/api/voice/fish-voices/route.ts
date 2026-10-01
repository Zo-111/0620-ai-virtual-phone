import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const rawBaseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim()
            ? body.baseUrl.trim()
            : "https://api.fish.audio";

        if (!apiKey) {
            return NextResponse.json({ error: "请先填写 Fish Audio API Key" }, { status: 400 });
        }

        // 处理 API Base URL，Fish Audio 的模型列表通常在 /model 或 /v1/model
        const cleanBase = rawBaseUrl.replace(/\/v1\/?$/, "").replace(/\/$/, "");
        const headers = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        };

        const voices: { id: string; name: string }[] = [];
        const seenIds = new Set<string>();

        // 1) 优先拉取用户自己创建/克隆的模型 (self=true)
        try {
            const selfUrl = `${cleanBase}/model?self=true&page_size=50`;
            const selfResp = await proxyFetch(selfUrl, { headers });
            if (selfResp.ok) {
                const data = await selfResp.json().catch(() => ({}));
                const items = Array.isArray(data.items) ? data.items : [];
                for (const item of items) {
                    const id = item._id || item.id;
                    const title = item.title || item.name;
                    if (id && !seenIds.has(id)) {
                        seenIds.add(id);
                        voices.push({ id, name: `[我的] ${title || id}` });
                    }
                }
            }
        } catch {
            // 容错处理
        }

        // 2) 拉取平台热门/推荐音色 (sort_by=task_count)
        try {
            const popUrl = `${cleanBase}/model?page_size=30&sort_by=task_count`;
            const popResp = await proxyFetch(popUrl, { headers });
            if (popResp.ok) {
                const data = await popResp.json().catch(() => ({}));
                const items = Array.isArray(data.items) ? data.items : [];
                for (const item of items) {
                    const id = item._id || item.id;
                    const title = item.title || item.name;
                    if (id && !seenIds.has(id)) {
                        seenIds.add(id);
                        voices.push({ id, name: `${title || id}` });
                    }
                }
            }
        } catch {
            // 容错处理
        }

        if (voices.length === 0) {
            voices.push(
                { id: "7f92f8afb8ec43bf81429cc1c9199cb1", name: "丁真 (示例推荐)" },
                { id: "54a511d819fb458d8e573e0a17406691", name: "雷电将军 (原神)" },
                { id: "e10228de3e49454199990b7936a29ab8", name: "派蒙 (原神)" },
                { id: "d69a5fb2ff5543c1a3eb899b823b1859", name: "纳西妲 (原神)" },
                { id: "8f7236e7293a40879f90f6e52c8b82ff", name: "温柔邻家姐姐" }
            );
        }

        return NextResponse.json({ voices });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `拉取模型失败: ${message}` }, { status: 500 });
    }
}
