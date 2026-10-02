import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 30;

function sanitizeApiKey(raw: string): string {
    return raw
        .trim()
        .replace(/^Bearer\s+/i, "")
        .replace(/^["']|["']$/g, "")
        .trim();
}

function resolveTtsUrl(rawBase: string | undefined): string {
    const base = (rawBase && typeof rawBase === "string" && rawBase.trim()
        ? rawBase.trim()
        : "https://api.fish.audio"
    ).replace(/\/$/, "");

    if (base.endsWith("/tts")) return base;
    if (base.endsWith("/v1")) return `${base}/tts`;
    return `${base}/v1/tts`;
}

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const { apiKey, baseUrl, text, reference_id, model } = body;

        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
            return NextResponse.json({ error: "Fish Audio API Key 未配置" }, { status: 400 });
        }
        if (!text || typeof text !== "string" || !text.trim()) {
            return NextResponse.json({ error: "合成文本不能为空" }, { status: 400 });
        }

        const cleanKey = sanitizeApiKey(apiKey);
        const ttsUrl = resolveTtsUrl(baseUrl);

        const headers: Record<string, string> = {
            Authorization: `Bearer ${cleanKey}`,
            "Content-Type": "application/json",
        };
        if (model && typeof model === "string" && model.trim()) {
            headers["model"] = model.trim();
        }

        const payload: Record<string, unknown> = {
            text: text.trim(),
            format: "mp3",
        };
        if (reference_id && typeof reference_id === "string" && reference_id.trim()) {
            payload.reference_id = reference_id.trim();
        }

        const upstreamResponse = await proxyFetch(ttsUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!upstreamResponse.ok) {
            const errText = await upstreamResponse.text().catch(() => "");
            let errMsg = `Fish Audio 报错 (HTTP ${upstreamResponse.status})`;
            try {
                const errJson = JSON.parse(errText);
                errMsg = errJson.message || errJson.error || errJson.detail || errMsg;
            } catch {
                if (errText) errMsg = `${errMsg}: ${errText.slice(0, 300)}`;
            }
            return NextResponse.json({
                error: `${errMsg} [请求地址: ${ttsUrl}]`,
            }, { status: upstreamResponse.status });
        }

        const audioBuffer = await upstreamResponse.arrayBuffer();
        return new NextResponse(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": audioBuffer.byteLength.toString(),
            },
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `代理请求失败: ${message}` }, { status: 500 });
    }
}
