import type { LucideIcon } from "lucide-react";
import {
  Activity, Archive, ArrowRightLeft, BellRing, Bot, Box, Building2, Camera, CircleCheck, CircleDot, CircleX, Clock, Cloud, Cog, Container,
  Contact, Cpu, CreditCard, Database, FileText, Gauge, GitBranch, Globe, HardDrive, Image, Inbox, Key, KeyRound, Layers, Lock, Mail,
  MessageSquare, Monitor, Network, Package, Route, ScrollText, Search, Send, Server, Shield, ShieldCheck, Smartphone, Split, Store, Table,
  Timer, Truck, User, UserCog, Users, Webhook, Workflow, Wrench, Zap,
} from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import {
  siAuth0, siClickhouse, siCloudflare, siDjango, siDocker, siElasticsearch, siFastapi, siFirebase,
  siGithub, siGo, siGooglecloud, siGrafana, siGraphql, siKubernetes, siMailgun, siMinio, siMongodb, siMysql, siNextdotjs, siNginx,
  siNodedotjs, siPostgresql, siPrometheus, siPython, siRabbitmq, siReact, siRedis, siSentry, siStripe, siSupabase,
  siTelegram, siTraefikproxy, siTypescript, siVercel,
} from "simple-icons";

export type AnyIcon = SimpleIcon | LucideIcon;
const isSimple = (i: AnyIcon): i is SimpleIcon => typeof i === "object" && i !== null && "path" in i;

/**
 * Icon names usable in *.graph.json ("icon": "postgres"). Lucide for generic things, simple-icons for brands (logos are
 * trademarks of their owners, shown only to name the technology). Icons whose simple-icons entry carries its own license
 * (Android, Apache Kafka, OpenTelemetry) or whose owner restricts third-party use (Apple) are left out on purpose.
 * Named imports only, so the bundle keeps just these. Add more here, or pass `icons` to registerIcons() from a scene.
 * scripts/layout.mjs reads the keys between `export const ICONS` and the end marker to warn about unknown names.
 */
export const ICONS: Record<string, AnyIcon> = {
  // generic (lucide)
  activity: Activity, archive: Archive, arrows: ArrowRightLeft, bell: BellRing, bot: Bot, box: Box, building: Building2, bucket: Archive,
  camera: Camera, "circle-check": CircleCheck, "circle-dot": CircleDot, "circle-x": CircleX, clock: Clock, cloud: Cloud, cog: Cog,
  container: Container, contact: Contact, cpu: Cpu, "credit-card": CreditCard, database: Database, disk: HardDrive, file: FileText,
  gauge: Gauge, branch: GitBranch, globe: Globe, image: Image, inbox: Inbox, key: Key, "key-round": KeyRound, layers: Layers, lock: Lock,
  mail: Mail, message: MessageSquare, monitor: Monitor, network: Network, package: Package, phone: Smartphone, route: Route,
  scroll: ScrollText, search: Search, send: Send, server: Server, shield: Shield, "shield-check": ShieldCheck, smartphone: Smartphone,
  split: Split, store: Store, table: Table, timer: Timer, truck: Truck, user: User, "user-cog": UserCog, users: Users, webhook: Webhook,
  workflow: Workflow, wrench: Wrench, zap: Zap,
  // brands (simple-icons)
  auth0: siAuth0, clickhouse: siClickhouse, cloudflare: siCloudflare,
  django: siDjango, docker: siDocker, elasticsearch: siElasticsearch, fastapi: siFastapi, firebase: siFirebase, github: siGithub, go: siGo,
  gcp: siGooglecloud, grafana: siGrafana, graphql: siGraphql, kubernetes: siKubernetes, mailgun: siMailgun, minio: siMinio,
  mongodb: siMongodb, mysql: siMysql, nextjs: siNextdotjs, nginx: siNginx, nodejs: siNodedotjs,
  postgres: siPostgresql, prometheus: siPrometheus, python: siPython, rabbitmq: siRabbitmq, react: siReact, redis: siRedis,
  sentry: siSentry, stripe: siStripe, supabase: siSupabase, telegram: siTelegram, traefik: siTraefikproxy, typescript: siTypescript,
  vercel: siVercel,
}; /* end ICONS */

/** Extra names from a deck (call once at module level in the scene file). */
export function registerIcons(extra: Record<string, AnyIcon>) {
  Object.assign(ICONS, extra);
}

/** Brands whose own colour is too dark for a dark tile: drawn in the tile's ink instead. */
const DARK_BRANDS = new Set(["000000", "181717", "1C1C1C", "231F20"]);

/**
 * Icon tile. Brand logos keep their colour on a white tile (they are designed for light grounds); lucide icons take
 * the tone's icon colour. In showcase the tile is a translucent glass chip, brands still on white for contrast.
 */
export function DiagramIcon({ name, size }: { name?: string; size: number }) {
  const icon = name ? ICONS[name] : undefined;
  if (!icon) return null;
  const inner = Math.round(size * 0.6);
  if (isSimple(icon)) {
    const fill = DARK_BRANDS.has(icon.hex.toUpperCase()) ? "#15171C" : `#${icon.hex}`;
    return (
      <span className="dg-ic dg-ic-brand" style={{ width: size, height: size }}>
        <svg width={inner} height={inner} viewBox="0 0 24 24" role="img" aria-label={icon.title}><path d={icon.path} fill={fill} /></svg>
      </span>
    );
  }
  const L = icon;
  return (
    <span className="dg-ic" style={{ width: size, height: size }}>
      <L size={inner} strokeWidth={2.1} aria-hidden />
    </span>
  );
}
