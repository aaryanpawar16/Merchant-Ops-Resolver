import { ImageResponse } from "next/og";

export const shareImageSize = { width: 1200, height: 630 };

// The picture shown when the site is shared in a post or a chat. Dark, with the product's one-line story.
export function shareImage() {
  const lime = "#c8f53c";
  const ember = "#ff6a3d";
  const mute = "#9ba39a";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#060807",
          color: "#f2f5ee",
          padding: 64,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 24, letterSpacing: 4, textTransform: "uppercase" }}>
          <div style={{ width: 16, height: 16, background: lime, display: "flex" }} />
          <div style={{ display: "flex" }}>Merchant Ops Resolver</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2, maxWidth: 980 }}>
            One instruction in. A failed settlement fixed, verified and closed.
          </div>
          <div style={{ display: "flex", fontSize: 30, color: mute, maxWidth: 900 }}>
            Four agents investigate, fix within policy, verify against the real system and close the case.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 14, fontSize: 22 }}>
            {["neatlogs traced", "checkpointed", "cfo.ai priced"].map((tag) => (
              <div key={tag} style={{ display: "flex", border: "1px solid #3a423a", padding: "10px 18px", color: mute }}>
                {tag}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24 }}>
            <div style={{ display: "flex", color: ember }}>Failed</div>
            <div style={{ display: "flex", color: mute }}>to</div>
            <div style={{ display: "flex", color: lime }}>Closed, verified</div>
          </div>
        </div>
      </div>
    ),
    { ...shareImageSize },
  );
}
