import { describe, expect, it } from "vitest";
import { parseArticleDescription, parseFrenchDate, parseInfosTrafic, parsePlans } from "../src/realtime/official.ts";

// Extrait simplifié du balisage réel de https://lignes-agglo.fr/infos-trafic/ (grille WPBakery)
const item = (date: string, lines: string[], slug: string, title: string) => `
<div class="vc_grid-item vc_clearfix vc_col-sm-4"><div class="vc_grid-item-mini vc_clearfix ">
  <div class="vc_custom_heading vc_gitem-post-data vc_gitem-post-data-source-post_date" ><div style="text-align: left" >${date}</div></div>
  <div class="vc_gitem-acf notif-picto-desktop">${lines.map((l) => `<img src="https://lignes-agglo.fr/x/${l}.png" alt="ligne ${l}" width="25" class="img-picto">`).join(", ")}</div>
  <div class="vc_custom_heading titre_notification"><p><a href="https://lignes-agglo.fr/infostrafic/${slug}/" class="vc_gitem-link" title="${title}">${title}</a></p></div>
  <a class="vc_general vc_btn3" a href="https://lignes-agglo.fr/infostrafic/${slug}/" title="Lire la suite">Lire la suite</a>
</div></div>`;

describe("site officiel lignes-agglo.fr", () => {
  it("parse les dates en français", () => {
    expect(parseFrenchDate("11 septembre 2026")).toBe("2026-09-10T22:00:00.000Z");
    expect(parseFrenchDate("1er août 2026")).toBe("2026-07-31T22:00:00.000Z");
    expect(parseFrenchDate("bientôt")).toBeNull();
  });

  it("extrait les infos trafic de la grille", () => {
    const html = item("11 septembre 2026", ["5", "5s"], "surcharge-ligne-5", "Surcharge Ligne 5") + item("2 octobre 2026", ["B2"], "b2-modif", "B2 MODIFICATION &rsquo;matin&rsquo;");
    expect(parseInfosTrafic(html)).toEqual([
      { title: "Surcharge Ligne 5", url: "https://lignes-agglo.fr/infostrafic/surcharge-ligne-5/", publishedAt: "2026-09-10T22:00:00.000Z", lineCodes: ["5", "5s"] },
      { title: "B2 MODIFICATION ’matin’", url: "https://lignes-agglo.fr/infostrafic/b2-modif/", publishedAt: "2026-10-01T22:00:00.000Z", lineCodes: ["B2"] },
    ]);
  });

  it("lit le texte d'un article", () => {
    expect(parseArticleDescription('<meta property="og:description" content="Ligne 5 En raison d&rsquo;une forte affluence" />')).toBe("Ligne 5 En raison d’une forte affluence");
  });

  it("liste les plans PDF avec un titre lisible", () => {
    const html = `<a href="https://lignes-agglo.fr/wp-content/uploads/2026/08/190626-Plan-Général-2_compressed-3.pdf"><img src="x.png"></a>
      <a href="https://lignes-agglo.fr/wp-content/uploads/2022/08/Plan-lignes-scolaires.pdf">Plan des lignes scolaires</a>`;
    expect(parsePlans(html)).toEqual([
      { title: "Plan Général 2", url: "https://lignes-agglo.fr/wp-content/uploads/2026/08/190626-Plan-Général-2_compressed-3.pdf" },
      { title: "Plan des lignes scolaires", url: "https://lignes-agglo.fr/wp-content/uploads/2022/08/Plan-lignes-scolaires.pdf" },
    ]);
  });
});
