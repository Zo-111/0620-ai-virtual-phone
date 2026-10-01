import { NextResponse } from "next/server";
import { proxyFetch } from "@/lib/proxy-fetch";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => ({}));
        const query = typeof body.query === "string" ? body.query.trim() : "";
        const accessKey = typeof body.accessKey === "string" && body.accessKey.trim()
            ? body.accessKey.trim()
            : process.env.UNSPLASH_ACCESS_KEY || "";

        if (!query) {
            return NextResponse.json({ error: "搜索关键词不能为空" }, { status: 400 });
        }

        const encodedQuery = encodeURIComponent(query);

        // 1) 如果有 accessKey，走官方 API
        if (accessKey) {
            const url = `https://api.unsplash.com/search/photos?query=${encodedQuery}&per_page=6&orientation=squarish`;
            const resp = await proxyFetch(url, {
                headers: {
                    Authorization: `Client-ID ${accessKey}`,
                    "Accept-Version": "v1",
                },
            });
            if (resp.ok) {
                const data = await resp.json();
                const results = Array.isArray(data.results) ? data.results : [];
                const photos = results.map((item: Record<string, unknown>) => {
                    const urls = (item.urls || {}) as Record<string, string>;
                    return {
                        id: item.id,
                        description: item.alt_description || item.description || query,
                        url: urls.regular || urls.small || urls.raw,
                        thumb: urls.thumb || urls.small,
                    };
                });
                return NextResponse.json({ photos });
            }
        }

        // 2) 无 Key 时的公开备用检索源 (Unsplash NAPI)
        try {
            const fallbackUrl = `https://unsplash.com/napi/search/photos?query=${encodedQuery}&per_page=6`;
            const fallbackResp = await proxyFetch(fallbackUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Accept: "*/*",
                },
            });
            if (fallbackResp.ok) {
                const data = await fallbackResp.json();
                const results = Array.isArray(data.results) ? data.results : [];
                const photos = results.map((item: Record<string, unknown>) => {
                    const urls = (item.urls || {}) as Record<string, string>;
                    return {
                        id: item.id,
                        description: item.alt_description || item.description || query,
                        url: urls.regular || urls.small || urls.raw,
                        thumb: urls.thumb || urls.small,
                    };
                });
                if (photos.length > 0) {
                    return NextResponse.json({ photos });
                }
            }
        } catch {
            // 忽略 fallback 失败
        }

        // 3) 若外部搜索均受限，返回兜底高质量精选 Unsplash 格式图片
        const fallbackPhotos = [
            {
                id: "unsplash-fallback-1",
                description: `${query} (推荐头像 1)`,
                url: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80`,
                thumb: `https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80`,
            },
            {
                id: "unsplash-fallback-2",
                description: `${query} (推荐头像 2)`,
                url: `https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80`,
                thumb: `https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80`,
            },
        ];
        return NextResponse.json({ photos: fallbackPhotos });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: `搜索失败: ${message}` }, { status: 500 });
    }
}
