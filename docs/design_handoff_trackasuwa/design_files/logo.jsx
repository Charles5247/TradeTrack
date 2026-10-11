function Logo({ size = 32, label = true }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <img
        src="../../logo/trackasuwa_mark_color_transparent.png"
        alt="TracKasuwa"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
      {label && <span style={{ fontWeight: 700 }}>TracKasuwa</span>}
    </div>
  );
}
