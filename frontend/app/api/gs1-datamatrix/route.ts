import { NextRequest, NextResponse } from "next/server";
import bwipjs from "bwip-js/node";

export const runtime = "nodejs";

// Renders a true GS1 DataMatrix (FNC1 + AI structure), same symbology rule
// used on Dentium's UDI label. `data` must be the bracketed AI element
// string, e.g. "(01)0999999123457(11)251203(17)331202(10)LOT001(21)AB12CD34EF".
export async function GET(req: NextRequest) {
  const data = req.nextUrl.searchParams.get("data");
  if (!data) {
    return NextResponse.json({ error: "data_required" }, { status: 400 });
  }
  const scaleParam = parseInt(req.nextUrl.searchParams.get("scale") || "6", 10);
  const scale = Math.min(Math.max(Number.isFinite(scaleParam) ? scaleParam : 6, 2), 12);

  try {
    const png = await bwipjs.toBuffer({
      bcid: "gs1datamatrix",
      text: data,
      scale,
      includetext: false,
      backgroundcolor: "FFFFFF",
    });
    return new NextResponse(png, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "render_failed", detail }, { status: 422 });
  }
}
