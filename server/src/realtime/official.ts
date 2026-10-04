import type { OfficialLink, OfficialResponse, RealtimeState } from "@bus-hub/shared";
import { config } from "../config.ts";
import { zonedToEpoch } from "../gtfs/time.ts";

/**
 * Contenus officiels publiés sur lignes-agglo.fr, le site du réseau :
 * l'info trafic (page « Infos trafic ») et les plans du réseau (PDF).
 * Le site n'expose pas ces contenus en API : on lit les pages HTML publiques.
 */

export interface OfficialPost {
  title: string;
  url: string;
  publishedAt: string | null;
  /** Lignes concernées, telles qu'affichées par le site (« 5 », « 5s », « B2 »…) */
  lineCodes: string[];
  description: string;
}

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&lsquo;/g, "’")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&hellip;/g, "…")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** « 11 septembre 2026 » → ISO (minuit à Paris), ou null */
export function parseFrenchDate(s: string): string | null {
  const m = s.trim().toLowerCase().match(/^(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!);
  if (month < 0) return null;
  return new Date(zonedToEpoch(Number(m[3]), month + 1, Number(m[1]))).toISOString();
}

/** Liste des infos trafic de la page officielle (grille WPBakery). */
export function parseInfosTrafic(html: string): Omit<OfficialPost, "description">[] {
  const posts: Omit<OfficialPost, "description">[] = [];
  const seen = new Set<string>();
  for (const block of html.split(/class="vc_grid-item[\s"]/).slice(1)) {
    const link = block.match(/<a href="(https?:\/\/[^"]*\/infostrafic\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link || seen.has(link[1]!)) continue;
    seen.add(link[1]!);
    const date = block.match(/post_date"[^>]*>\s*<div[^>]*>([^<]+)</);
    const lineCodes = [...block.matchAll(/alt="ligne ([^"]+)"/gi)].map((m) => m[1]!.trim());
    posts.push({
      title: text(link[2]!),
      url: link[1]!,
      publishedAt: date ? parseFrenchDate(text(date[1]!)) : null,
      lineCodes: [...new Set(lineCodes)],
    });
  }
  return posts;
}

/** Texte d'un article d'info trafic (balise og:description, renseignée par le site). */
export function parseArticleDescription(html: string): string {
  const m = html.match(/<meta property="og:description" content="([^"]*)"/);
  return m ? text(m[1]!) : "";
}

/** Plans du réseau en PDF, avec un titre lisible. */
export function parsePlans(html: string): OfficialLink[] {
  const out: OfficialLink[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href="(https?:\/\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = m[1]!;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title: text(m[2]!) || titleFromPdf(url), url });
  }
  return out;
}

function titleFromPdf(url: string): string {
  const file = decodeURIComponent(url.split("/").pop() ?? "").replace(/\.pdf$/i, "");
  const t = file
    .replace(/^\d{6}-/, "") // préfixe de date AAMMJJ
    .replace(/[-_]?(compressed|\d+x\d+)(-\d+)?/gi, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return t || "Document PDF";
}

/** Liens officiels stables du réseau (pages du site lignes-agglo.fr et applis). */
export const OFFICIAL_LINKS: OfficialLink[] = [
  { title: "Site officiel Lignes de l'Agglo", url: "https://lignes-agglo.fr/", description: "Informations, actualités et services du réseau" },
  { title: "Fiches horaires officielles", url: "https://lignes-agglo.fr/les-fiches-horaires/", description: "Horaires de chaque ligne régulière" },
  { title: "Calculateur d'itinéraire", url: "https://lignes-agglo.fr/calculer-votre-itineraire/", description: "Outil officiel de recherche d'itinéraire" },
  { title: "Infos trafic en direct", url: "https://lignes-agglo.fr/infos-trafic/", description: "Perturbations publiées par le réseau" },
  { title: "Alertes SMS", url: "https://lignes-agglo.fr/sabonner-aux-alertes-sms/", description: "Recevoir les perturbations de vos lignes par SMS" },
  { title: "Bus à la demande", url: "https://lignes-agglo.fr/bus-a-la-demande/", description: "Réservation du transport à la demande" },
  { title: "Circuits scolaires", url: "https://lignes-agglo.fr/se-deplacer/les-circuits-scolaires/" },
  { title: "Lignes par commune", url: "https://lignes-agglo.fr/les-lignes-par-commune/" },
  { title: "Accessibilité", url: "https://lignes-agglo.fr/laccessibilite/" },
  { title: "Objets trouvés", url: "https://lignes-agglo.fr/objets-trouves-perdus/" },
  { title: "L'appli officielle", url: "https://lignes-agglo.fr/lappli-lignes-de-lagglo/", description: "Applications RTM et La Métropole Mobilité" },
  { title: "La Métropole Mobilité", url: "https://www.lametropolemobilite.fr/", description: "Portail mobilité de la Métropole Aix-Marseille-Provence" },
];

const CONTACT = { phone: "04 42 03 24 25", phoneHref: "tel:+33442032425", site: "https://lignes-agglo.fr/" };

async function getHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "bus-hub/1.0 (+https://github.com/LaFicelleCmoi/bus-hub)", Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

export class OfficialSiteService {
  private posts: OfficialPost[] = [];
  private documents: OfficialLink[] = [];
  private fetchedAt: string | null = null;
  private error: string | null = null;
  /** Texte des articles déjà lus, par URL (ils changent rarement) */
  private readonly descriptions = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private refreshing: Promise<void> | null = null;

  get state(): RealtimeState {
    return this.error ? (this.fetchedAt ? "degraded" : "unavailable") : this.fetchedAt ? "ok" : "degraded";
  }

  get lastFetch(): string | null {
    return this.fetchedAt;
  }

  get lastError(): string | null {
    return this.error;
  }

  get currentPosts(): OfficialPost[] {
    return this.posts;
  }

  refresh(): Promise<void> {
    this.refreshing ??= this.doRefresh().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /**
   * À appeler avant de répondre : attend le premier chargement (démarrage à froid),
   * puis relance en arrière-plan si les données ont vieilli (les timers ne tournent pas
   * de façon fiable sur une plateforme serverless).
   */
  async ensureFresh(): Promise<void> {
    if (!this.fetchedAt && !this.error) {
      await Promise.race([this.refresh(), new Promise((r) => setTimeout(r, 10_000))]);
      return;
    }
    const age = this.fetchedAt ? Date.now() - Date.parse(this.fetchedAt) : Infinity;
    if (age > config.official.refreshMs) void this.refresh();
  }

  private async doRefresh(): Promise<void> {
    const base = config.official.baseUrl;
    try {
      const [list, plans] = await Promise.all([getHtml(`${base}/infos-trafic/`), getHtml(`${base}/les-plans-du-reseau/`).catch(() => null)]);
      const items = parseInfosTrafic(list).slice(0, config.official.maxPosts);
      if (items.length === 0) throw new Error("aucune info trafic trouvée sur la page (structure du site modifiée ?)");
      await Promise.all(
        items
          .filter((p) => !this.descriptions.has(p.url))
          .map(async (p) => {
            const d = await getHtml(p.url).then(parseArticleDescription).catch(() => null);
            if (d !== null) this.descriptions.set(p.url, d);
          }),
      );
      this.posts = items.map((p) => ({ ...p, description: this.descriptions.get(p.url) ?? "" }));
      if (plans) {
        const docs = parsePlans(plans);
        if (docs.length) this.documents = docs;
      }
      this.fetchedAt = new Date().toISOString();
      this.error = null;
    } catch (e) {
      this.error = `Site officiel indisponible : ${(e as Error).message}`;
    }
  }

  start(): void {
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), config.official.refreshMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  response(): OfficialResponse {
    return { documents: this.documents, links: OFFICIAL_LINKS, contact: CONTACT, fetchedAt: this.fetchedAt, error: this.error };
  }
}
