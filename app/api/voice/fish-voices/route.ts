import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 25;

function sanitizeApiKey(raw: string): string {
    return raw
        .trim()
        .replace(/^Bearer\s+/i, "")
        .replace(/^["']|["']$/g, "")
        .trim();
}

function resolveModelBase(rawBase: string | undefined): string {
    const base = (rawBase && typeof rawBase === "string" && rawBase.trim()
        ? rawBase.trim()
        : "https://api.fish.audio"
    ).replace(/\/$/, "");

    if (base.endsWith("/v1")) return base;
    return `${base}/v1`;
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const rawApiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const rawBaseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

        if (!rawApiKey) {
            return NextResponse.json({ error: "请先填写 Fish Audio API Key" }, { status: 400 });
        }

        const cleanKey = sanitizeApiKey(rawApiKey);
        const v1Base = resolveModelBase(rawBaseUrl);
        const rootBase = v1Base.replace(/\/v1$/, "");

        const headers = {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
        };

        const voices: { id: string; name: string }[] = [];
        const seenIds = new Set<string>();
        let lastError = "";

        // 探测候选的 model 列表 URL（同时支持 /v1/model 和 /model）
        const candidateUrls = [
            `${v1Base}/model?self=true&page_size=50`,
            `${rootBase}/model?self=true&page_size=50`,
            `${v1Base}/model?page_size=30&sort_by=task_count`,
            `${rootBase}/model?page_size=30&sort_by=task_count`,
        ];

        for (const url of candidateUrls) {
            try {
                const resp = await proxyFetch(url, { headers });
                if (resp.ok) {
                    const data = await resp.json().catch(() => ({}));
                    const items = Array.isArray(data.items) ? data.items : [];
                    for (const item of items) {
                        const id = item._id || item.id;
                        const title = item.title || item.name;
                        if (id && !seenIds.has(id)) {
                            seenIds.add(id);
                            const prefix = url.includes("self=true") ? "[我的] " : "";
                            voices.push({ id, name: `${prefix}${title || id}` });
                        }
                    }
                } else {
                    const errText = await resp.text().catch(() => "");
                    try {
                        const errJson = JSON.parse(errText);
                        lastError = errJson.message || errJson.error || errJson.detail || `HTTP ${resp.status}`;
                    } catch {
                        lastError = `HTTP ${resp.status} ${errText.slice(0, 100)}`;
                    }
                }
            } catch (e) {
                lastError = e instanceof Error ? e.message : String(e);
            }
        }

        // 若官方接口暂时没有返回自定义模型，补充高品质热门音色兜底
        if (voices.length === 0) {
            voices.push(
                { id: "7f92f8afb8ec43bf81429cc1c9199cb1", name: "丁真 (推荐)" },
                { id: "54a511d819fb458d8e573e0a17406691", name: "雷电将军 (原神)" },
                { id: "e10228de3e49454199990b7936a29ab8", name: "派蒙 (原神)" },
                { id: "d69a5fb2ff5543c1a3eb899b823b1859", name: "纳西妲 (原神)" },
                { id: "8f7236e7293a40879f90f6e52c8b82ff", name: "温柔邻家姐姐" }
            );
        }

        return NextResponse.json({
            voices,
            warning: lastError ? `部分接口提示: ${lastError}` : undefined,
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `拉取模型失败: ${message}` }, { status: 500 });
    }
}
