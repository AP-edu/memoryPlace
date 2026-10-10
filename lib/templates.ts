// Famous places to start a palace from (pure data + geometry, no React).
//
// Real buildings make the strongest palaces: you can picture them, and many
// people already have. Each template is a simplified but faithful plan of a
// real (or literary) place: rooms in level metres (x east, z north, min
// corner + size), doors on shared walls, furniture in room-local metres, and
// suggested loci (labels only, no cards) on the walls. Furniture faces south
// at rot 0, west at 90, north at 180, east at 270. lib/templates.test.ts
// checks every plan: no overlaps, every room reachable, doors on real shared
// walls, nothing blocking a doorway, loci clear of openings.

import type { Level, Locus, Opening, OpeningKind, Room, WallFace } from "@/types/database";
import { FURNITURE, clampToRoom, type FurnitureItem, type FurnitureKind, type Rotation } from "./furniture";
import { wallLine } from "./building";
import { levelPlanFor, type Blueprint } from "./blueprint";
import { locusPercent, wallPoint } from "./geometry";

export interface TemplateLocus {
  label: string;
  wall: WallFace;
  /** 0..1 along the wall (lib/geometry wallSegment direction). */
  at: number;
  height?: number;
}

export interface TemplateFurniture {
  kind: FurnitureKind;
  x: number;
  z: number;
  rot?: Rotation;
  color?: string;
}

export interface TemplateRoom {
  key: string;
  title: string;
  x: number;
  z: number;
  w: number;
  d: number;
  h?: number;
  color?: string | null;
  hallway?: boolean;
  furniture?: TemplateFurniture[];
  loci?: TemplateLocus[];
}

export interface TemplateDoor {
  a: string;
  b: string;
  kind?: OpeningKind;
  /** Metres. Defaults: door 1.0, archway 2.0. */
  width?: number;
  /** Where along the shared stretch (0..1, default the middle). */
  at?: number;
}

export interface PalaceTemplate {
  id: string;
  name: string;
  place: string;
  era: string;
  blurb: string;
  rooms: TemplateRoom[];
  doors: TemplateDoor[];
}

const col = (x: number, z: number, color?: string): TemplateFurniture => ({ kind: "column", x, z, color });

// ---------------------------------------------------------------------------- the places

const PARTHENON: PalaceTemplate = {
  id: "parthenon",
  name: "The Parthenon",
  place: "Athens, Greece",
  era: "438 BC",
  blurb: "Athena's temple on the Acropolis: two porches, the great hall with her gold-and-ivory statue, the treasury of the maidens and a colonnade along the frieze.",
  rooms: [
    {
      key: "east",
      title: "East porch",
      x: 54,
      z: 0,
      w: 5,
      d: 21,
      h: 9,
      furniture: [2, 5.5, 9, 12.5, 16].map((z) => col(4, z)),
      loci: [
        { label: "Dedication inscription", wall: "south", at: 0.5 },
        { label: "Six Doric columns", wall: "east", at: 0.9, height: 2.6 },
      ],
    },
    {
      key: "naos",
      title: "Hall of Athena (naos)",
      x: 18.5,
      z: 0,
      w: 35.5,
      d: 21,
      h: 12,
      color: "#c9a227",
      furniture: [
        { kind: "statue", x: 4, z: 10.5, rot: 270, color: "#e8c46a" },
        { kind: "fountain", x: 7.5, z: 10.5, color: "#7aa6c2" },
        ...[3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33].flatMap((x) => [col(x, 4), col(x, 17)]),
        ...[7.25, 13.75].map((z) => col(1.5, z)),
      ],
      loci: [
        { label: "Athena Parthenos, gold and ivory", wall: "west", at: 0.5, height: 2.4 },
        { label: "Nike in Athena's right hand", wall: "south", at: 0.15 },
        { label: "The great shield", wall: "north", at: 0.15 },
        { label: "Reflecting pool", wall: "south", at: 0.45 },
        { label: "Two-storey colonnade", wall: "north", at: 0.45 },
        { label: "Votive offerings", wall: "south", at: 0.8 },
        { label: "Light from the great door", wall: "north", at: 0.8 },
      ],
    },
    {
      key: "treasury",
      title: "Treasury of the maidens",
      x: 5,
      z: 0,
      w: 13.5,
      d: 21,
      h: 10,
      furniture: [
        ...[
          [4.5, 7],
          [9, 7],
          [4.5, 14],
          [9, 14],
        ].map(([x, z]) => col(x, z)),
        { kind: "cabinet", x: 12.9, z: 4, rot: 90, color: "#b08d57" },
        { kind: "cabinet", x: 12.9, z: 10.5, rot: 90, color: "#b08d57" },
        { kind: "cabinet", x: 12.9, z: 17, rot: 90, color: "#b08d57" },
      ],
      loci: [
        { label: "Four Ionic columns", wall: "north", at: 0.3 },
        { label: "Treasure chests of the League", wall: "east", at: 0.5, height: 2.5 },
        { label: "Temple accounts in stone", wall: "south", at: 0.5 },
        { label: "Athena's woven robe (peplos)", wall: "north", at: 0.75 },
      ],
    },
    {
      key: "west",
      title: "West porch",
      x: 0,
      z: 0,
      w: 5,
      d: 21,
      h: 9,
      furniture: [2, 5.5, 9, 12.5, 16].map((z) => col(1, z)),
      loci: [{ label: "Back door of the treasury", wall: "south", at: 0.5 }],
    },
    {
      key: "colonnade",
      title: "North colonnade",
      x: 0,
      z: 21,
      w: 59,
      d: 4,
      h: 9,
      furniture: [7, 11.3, 15.6, 19.9, 24.2, 28.5, 32.8, 37.1, 41.4, 45.7, 50].map((x) => col(x, 3)),
      loci: [
        { label: "Frieze: horsemen gathering", wall: "south", at: 0.2, height: 2.4 },
        { label: "Frieze: the procession", wall: "south", at: 0.45, height: 2.4 },
        { label: "Frieze: the gods watching", wall: "south", at: 0.7, height: 2.4 },
        { label: "Metopes: the fall of Troy", wall: "north", at: 0.5, height: 2.6 },
      ],
    },
  ],
  doors: [
    { a: "east", b: "naos", kind: "archway", width: 4 },
    { a: "east", b: "colonnade", kind: "archway", width: 3 },
    { a: "colonnade", b: "west", kind: "archway", width: 3 },
    { a: "west", b: "treasury", kind: "archway", width: 3.5 },
  ],
};

const RED = "#b8423a";
const OCHRE = "#d9a62e";

const VETTII: PalaceTemplate = {
  id: "house-of-the-vettii",
  name: "House of the Vettii",
  place: "Pompeii, Italy",
  era: "AD 62–79",
  blurb: "A rich Roman townhouse frozen by Vesuvius: entrance, red atrium with its rain pool, a colonnaded garden and dining rooms painted with myths.",
  rooms: [
    {
      key: "fauces",
      title: "Entrance (fauces)",
      x: 9,
      z: 0,
      w: 3,
      d: 6,
      h: 4,
      loci: [
        { label: "Priapus weighing his gold", wall: "east", at: 0.4 },
        { label: "Doorkeeper's niche", wall: "west", at: 0.5 },
      ],
    },
    {
      key: "atrium",
      title: "Atrium",
      x: 4,
      z: 6,
      w: 12,
      d: 12,
      h: 6,
      color: RED,
      furniture: [
        { kind: "fountain", x: 6, z: 6, color: "#7aa6c2" },
        { kind: "cabinet", x: 2, z: 11.4, color: "#8c5a2b" },
        { kind: "cabinet", x: 10, z: 11.4, color: "#8c5a2b" },
        { kind: "plant", x: 1, z: 1 },
        { kind: "plant", x: 11, z: 1 },
      ],
      loci: [
        { label: "Strongbox of the Vettii", wall: "north", at: 0.15, height: 2.5 },
        { label: "Ancestor masks", wall: "north", at: 0.85, height: 2.5 },
        { label: "Lararium shrine", wall: "east", at: 0.75 },
        { label: "Cupids frieze", wall: "south", at: 0.2 },
        { label: "Portrait niche", wall: "west", at: 0.75 },
      ],
    },
    {
      key: "cubiculum",
      title: "Bedroom (cubiculum)",
      x: 0,
      z: 6,
      w: 4,
      d: 5,
      h: 3.5,
      color: OCHRE,
      furniture: [{ kind: "bed", x: 1.6, z: 3, color: "#8c4a3c" }],
      loci: [{ label: "Painted bed alcove", wall: "west", at: 0.5 }],
    },
    {
      key: "kitchen",
      title: "Kitchen (culina)",
      x: 16,
      z: 6,
      w: 5,
      d: 5,
      h: 3.5,
      furniture: [
        { kind: "fireplace", x: 2.5, z: 4.7 },
        { kind: "table", x: 3, z: 2, color: "#7a5230" },
      ],
      loci: [
        { label: "Bronze pots on the hearth", wall: "north", at: 0.25 },
        { label: "Amphorae of wine", wall: "south", at: 0.5 },
      ],
    },
    {
      key: "peristyle",
      title: "Peristyle garden",
      x: 2,
      z: 18,
      w: 20,
      d: 16,
      h: 5,
      color: "#4f8a4b",
      furniture: [
        ...[
          [2, 2],
          [18, 2],
          [2, 14],
          [18, 14],
          [4.5, 2],
          [12.5, 2],
          [15.5, 2],
          [5, 14],
          [7.2, 14],
          [12.8, 14],
          [15.5, 14],
          [18, 7],
          [18, 9.5],
          [2, 5],
          [2, 8],
          [2, 11],
        ].map(([x, z]) => col(x, z, "#e8d9c0")),
        { kind: "fountain", x: 10, z: 8 },
        { kind: "statue", x: 10, z: 11 },
        { kind: "plant", x: 6, z: 6 },
        { kind: "plant", x: 14, z: 6 },
        { kind: "plant", x: 6, z: 10 },
        { kind: "plant", x: 14, z: 10 },
      ],
      loci: [
        { label: "Hermes herm", wall: "north", at: 0.2 },
        { label: "Garden fresco of birds", wall: "west", at: 0.3 },
        { label: "Marble table", wall: "west", at: 0.7 },
        { label: "Rose beds", wall: "south", at: 0.85 },
      ],
    },
    {
      key: "pentheus",
      title: "Pentheus room",
      x: 22,
      z: 18,
      w: 6,
      d: 8,
      h: 4.5,
      color: RED,
      furniture: [
        { kind: "table", x: 3.2, z: 4, color: "#7a5230" },
        { kind: "sofa", x: 3.2, z: 6.8, color: "#8c4a3c" },
        { kind: "sofa", x: 3.2, z: 1.2, rot: 180, color: "#8c4a3c" },
        { kind: "sofa", x: 5.3, z: 4, rot: 90, color: "#8c4a3c" },
      ],
      loci: [
        { label: "Death of Pentheus", wall: "east", at: 0.5 },
        { label: "Baby Hercules strangling the snakes", wall: "north", at: 0.5 },
        { label: "Dirce and the bull", wall: "south", at: 0.5 },
      ],
    },
    {
      key: "ixion",
      title: "Ixion room",
      x: 22,
      z: 26,
      w: 6,
      d: 8,
      h: 4.5,
      color: OCHRE,
      furniture: [
        { kind: "table", x: 3.2, z: 4, color: "#7a5230" },
        { kind: "armchair", x: 4.8, z: 4, rot: 90 },
        { kind: "lamp", x: 5.4, z: 7.4 },
      ],
      loci: [
        { label: "Ixion bound to the wheel", wall: "east", at: 0.5 },
        { label: "Daedalus and Pasiphaë", wall: "north", at: 0.5 },
        { label: "Ariadne abandoned on Naxos", wall: "south", at: 0.5 },
      ],
    },
    {
      key: "oecus",
      title: "Hall of the Cupids",
      x: 8,
      z: 34,
      w: 8,
      d: 6,
      h: 5,
      color: "#2b2b33",
      furniture: [
        { kind: "sofa", x: 4, z: 5.4, color: RED },
        { kind: "lamp", x: 1, z: 5.4 },
        { kind: "lamp", x: 7, z: 5.4 },
      ],
      loci: [
        { label: "Cupids as goldsmiths", wall: "north", at: 0.2 },
        { label: "Cupids making perfume", wall: "north", at: 0.8 },
        { label: "Cupids racing chariots", wall: "east", at: 0.5 },
        { label: "Cupids selling wine", wall: "west", at: 0.5 },
      ],
    },
  ],
  doors: [
    { a: "fauces", b: "atrium", width: 1.4 },
    { a: "atrium", b: "cubiculum" },
    { a: "atrium", b: "kitchen" },
    { a: "atrium", b: "peristyle", kind: "archway", width: 4 },
    { a: "peristyle", b: "pentheus", kind: "archway", width: 2.4 },
    { a: "peristyle", b: "ixion", kind: "archway", width: 2.4 },
    { a: "peristyle", b: "oecus", kind: "archway", width: 3 },
  ],
};

const GOLD = "#d4a017";

const TUTANKHAMUN: PalaceTemplate = {
  id: "tomb-of-tutankhamun",
  name: "Tomb of Tutankhamun",
  place: "Valley of the Kings, Egypt",
  era: "1323 BC",
  blurb: "KV62 as Howard Carter found it in 1922: the descending corridor, the crowded antechamber, the annex, the yellow burial chamber and Anubis guarding the treasury.",
  rooms: [
    {
      key: "corridor",
      title: "Descending corridor",
      x: 5.8,
      z: 0,
      w: 1.7,
      d: 8,
      h: 2.6,
      color: "#b08d57",
      loci: [
        { label: "Sixteen steps down", wall: "west", at: 0.15 },
        { label: "The resealed doorway", wall: "east", at: 0.85 },
      ],
    },
    {
      key: "antechamber",
      title: "Antechamber",
      x: 0,
      z: 8,
      w: 7.9,
      d: 3.6,
      h: 2.7,
      color: "#b08d57",
      furniture: [
        { kind: "bed", x: 1.3, z: 2.75, rot: 90, color: GOLD },
        { kind: "bed", x: 3.6, z: 2.75, rot: 90, color: GOLD },
        { kind: "statue", x: 7.5, z: 0.75, rot: 90, color: "#1d1d24" },
        { kind: "statue", x: 7.5, z: 2.85, rot: 90, color: "#1d1d24" },
        { kind: "cabinet", x: 1.3, z: 0.5, rot: 180, color: "#e8c46a" },
        { kind: "table", x: 4.2, z: 0.6, color: GOLD },
      ],
      loci: [
        { label: "Cow-headed couch", wall: "north", at: 0.15 },
        { label: "Lion couch", wall: "north", at: 0.45 },
        { label: "Painted hunting chest", wall: "west", at: 0.5 },
        { label: "Golden throne", wall: "south", at: 0.6 },
        { label: "Guardian statue, left", wall: "east", at: 0.12, height: 2.3 },
        { label: "Guardian statue, right", wall: "east", at: 0.88, height: 2.3 },
      ],
    },
    {
      key: "annex",
      title: "Annex",
      x: 0.5,
      z: 5.4,
      w: 4.3,
      d: 2.6,
      h: 2.5,
      color: "#b08d57",
      furniture: [
        { kind: "cabinet", x: 0.8, z: 0.4, rot: 180 },
        { kind: "table", x: 3.3, z: 0.5, color: "#9a6b3f" },
      ],
      loci: [
        { label: "Jars of wine and oil", wall: "south", at: 0.45 },
        { label: "Baskets of food", wall: "south", at: 0.75 },
      ],
    },
    {
      key: "burial",
      title: "Burial chamber",
      x: 7.9,
      z: 6.6,
      w: 4,
      d: 6.4,
      h: 3.6,
      color: GOLD,
      furniture: [
        { kind: "bed", x: 2, z: 3.2, color: GOLD },
        { kind: "lamp", x: 0.5, z: 0.5, color: GOLD },
        { kind: "lamp", x: 3.5, z: 6, color: GOLD },
      ],
      loci: [
        { label: "Gilded shrines, nested four deep", wall: "north", at: 0.5 },
        { label: "Opening of the Mouth", wall: "east", at: 0.2 },
        { label: "Twelve baboons of the night", wall: "south", at: 0.5 },
        { label: "Nut welcomes the king", wall: "west", at: 0.85 },
      ],
    },
    {
      key: "treasury",
      title: "Treasury",
      x: 11.9,
      z: 8,
      w: 3.8,
      d: 4.8,
      h: 2.4,
      color: "#8c6d3f",
      furniture: [
        { kind: "statue", x: 1.0, z: 4.1, color: "#1d1d24" },
        { kind: "cabinet", x: 3.4, z: 0.9, rot: 90, color: GOLD },
        { kind: "cabinet", x: 3.4, z: 3.9, rot: 90, color: GOLD },
      ],
      loci: [
        { label: "Anubis on his shrine", wall: "north", at: 0.55 },
        { label: "Canopic shrine", wall: "east", at: 0.5 },
        { label: "Model boats for the afterlife", wall: "south", at: 0.5 },
      ],
    },
  ],
  doors: [
    // Tombs have doorways, not doors (the seals were broken in 1922).
    { a: "corridor", b: "antechamber", kind: "archway", width: 1.1 },
    { a: "antechamber", b: "annex", kind: "archway", width: 0.9 },
    { a: "antechamber", b: "burial", kind: "archway", width: 1.2 },
    { a: "burial", b: "treasury", kind: "archway", width: 1.2 },
  ],
};

const BAKER_STREET: PalaceTemplate = {
  id: "221b-baker-street",
  name: "221B Baker Street",
  place: "London (fiction)",
  era: "1881–1904",
  blurb: "Sherlock Holmes's lodgings, first floor: the cluttered sitting room by the fire, Holmes's bedroom of criminal portraits and Watson's room across the hall.",
  rooms: [
    {
      key: "landing",
      title: "Landing",
      x: 0,
      z: 3.6,
      w: 2.2,
      d: 5,
      h: 2.9,
      hallway: true,
      furniture: [
        { kind: "plant", x: 1.1, z: 0.4 },
        { kind: "lamp", x: 1.9, z: 4.6, color: "#6b4a2b" },
      ],
      loci: [
        { label: "Seventeen steps up", wall: "west", at: 0.3 },
        { label: "Hat and coat stand", wall: "north", at: 0.5 },
      ],
    },
    {
      key: "sitting",
      title: "Sitting room",
      x: 2.2,
      z: 3.6,
      w: 5.5,
      d: 5,
      h: 3,
      color: "#8c4a3c",
      furniture: [
        { kind: "fireplace", x: 5.25, z: 2.5, rot: 90 },
        { kind: "armchair", x: 4.0, z: 1.6, rot: 270, color: "#8c4a3c" },
        { kind: "armchair", x: 4.0, z: 3.4, rot: 270, color: "#3f6e8c" },
        { kind: "desk", x: 4.6, z: 0.4, rot: 180, color: "#4a3320" },
        { kind: "sofa", x: 1.05, z: 4.4, color: "#5b3a2e" },
        { kind: "bookshelf", x: 0.2, z: 1.0, rot: 270 },
        { kind: "table", x: 2.5, z: 2.5 },
        { kind: "rug", x: 3.4, z: 2.5, color: "#7a2e2e" },
        { kind: "lamp", x: 5.2, z: 4.6 },
      ],
      loci: [
        { label: "V.R. in bullet holes", wall: "north", at: 0.2 },
        { label: "Bow window on Baker Street", wall: "north", at: 0.8 },
        { label: "Tobacco in the Persian slipper", wall: "east", at: 0.15 },
        { label: "Letters knifed to the mantel", wall: "east", at: 0.5, height: 1.75 },
        { label: "Chemistry desk", wall: "south", at: 0.85 },
        { label: "The violin", wall: "south", at: 0.12 },
        { label: "Commonplace books", wall: "west", at: 0.2, height: 2.3 },
      ],
    },
    {
      key: "holmes",
      title: "Holmes's bedroom",
      x: 2.2,
      z: 8.6,
      w: 3.6,
      d: 3.6,
      h: 3,
      color: "#3f4a5c",
      furniture: [
        { kind: "bed", x: 1.0, z: 2.3 },
        { kind: "cabinet", x: 3.0, z: 3.25 },
      ],
      loci: [
        { label: "Portraits of famous criminals", wall: "west", at: 0.5 },
        { label: "Wardrobe of disguises", wall: "east", at: 0.8 },
      ],
    },
    {
      key: "watson",
      title: "Watson's room",
      x: 2.2,
      z: 0,
      w: 3.6,
      d: 3.6,
      h: 3,
      color: "#5b7fb5",
      furniture: [
        { kind: "bed", x: 1.0, z: 1.2 },
        { kind: "desk", x: 2.8, z: 0.4, rot: 180 },
      ],
      loci: [
        { label: "Service revolver in the drawer", wall: "east", at: 0.5 },
        { label: "Doctor's bag", wall: "west", at: 0.6 },
      ],
    },
  ],
  doors: [
    { a: "landing", b: "sitting", width: 0.9 },
    { a: "sitting", b: "holmes", width: 0.9, at: 0.75 },
    { a: "sitting", b: "watson", width: 0.9, at: 0.5 },
  ],
};

const OAK = "#7a5230";
const BUSTS_SOUTH = ["Homer", "Plato", "Aristotle", "Socrates", "Cicero", "Shakespeare", "Milton"];
const BUSTS_NORTH = ["Newton", "Locke", "Swift", "Boyle", "Burke", "Rosalind Franklin", "Ada Lovelace"];
const BAY_X = Array.from({ length: 15 }, (_, i) => 4 + i * 4);
const BUST_X = [6, 14, 22, 30, 38, 46, 54];

const LONG_ROOM: PalaceTemplate = {
  id: "trinity-long-room",
  name: "The Long Room",
  place: "Trinity College Dublin",
  era: "1732",
  blurb: "Sixty-five metres of oak bookcases under a barrel vault, marble busts of great minds down the aisle, and the Book of Kells in the treasury next door.",
  rooms: [
    {
      key: "kells",
      title: "Book of Kells treasury",
      x: 0,
      z: 2,
      w: 12,
      d: 8,
      h: 4.5,
      color: "#2b3a55",
      furniture: [
        { kind: "table", x: 6, z: 4, color: "#1d1d24" },
        { kind: "table", x: 3, z: 6.5, color: "#1d1d24" },
        { kind: "table", x: 9, z: 6.5, color: "#1d1d24" },
        { kind: "lamp", x: 0.6, z: 0.6 },
        { kind: "lamp", x: 11.4, z: 7.4 },
      ],
      loci: [
        { label: "Book of Kells: the Chi Rho page", wall: "north", at: 0.5 },
        { label: "Book of Durrow", wall: "north", at: 0.2 },
        { label: "Book of Armagh", wall: "south", at: 0.5 },
        { label: "Scribe's quills and vellum", wall: "west", at: 0.5 },
      ],
    },
    {
      key: "long",
      title: "Long Room",
      x: 12,
      z: 0,
      w: 64,
      d: 12,
      h: 14,
      color: OAK,
      furniture: [
        ...BAY_X.flatMap((x) => [
          { kind: "bookshelf" as const, x, z: 0.6, rot: 90 as Rotation, color: OAK },
          { kind: "bookshelf" as const, x, z: 11.4, rot: 90 as Rotation, color: OAK },
        ]),
        ...BUST_X.flatMap((x) => [
          { kind: "statue" as const, x, z: 2.0, rot: 180 as Rotation, color: "#ece6d8" },
          { kind: "statue" as const, x, z: 10.0, color: "#ece6d8" },
        ]),
        { kind: "cabinet", x: 61, z: 6, rot: 90, color: "#c9a227" },
      ],
      loci: [
        ...BUSTS_SOUTH.map((name, i) => ({ label: `Bust of ${name}`, wall: "south" as const, at: BUST_X[i] / 64, height: 2.8 })),
        ...BUSTS_NORTH.map((name, i) => ({ label: `Bust of ${name}`, wall: "north" as const, at: BUST_X[i] / 64, height: 2.8 })),
        { label: "Brian Boru harp", wall: "east", at: 0.2, height: 2.4 },
      ],
    },
    {
      key: "colonnade",
      title: "Entrance colonnade",
      x: 76,
      z: 3,
      w: 8,
      d: 6,
      h: 4,
      furniture: [
        { kind: "plant", x: 0.6, z: 0.6 },
        { kind: "plant", x: 0.6, z: 5.4 },
      ],
      loci: [{ label: "College Park through the arches", wall: "east", at: 0.5 }],
    },
  ],
  doors: [
    { a: "kells", b: "long", width: 1.4 },
    { a: "long", b: "colonnade", kind: "archway", width: 2.5 },
  ],
};

const HOME: PalaceTemplate = {
  id: "family-home",
  name: "A family home",
  place: "Anywhere",
  era: "Today",
  blurb: "A ready-made two-bedroom home to reshape into yours: move the walls on the blueprint, swap the furniture in the studio. Your own home is the easiest palace to walk.",
  rooms: [
    {
      key: "hall",
      title: "Hallway",
      x: 0,
      z: 0,
      w: 2,
      d: 12,
      h: 2.6,
      hallway: true,
      furniture: [{ kind: "plant", x: 1, z: 11.4 }],
      loci: [
        { label: "Front door", wall: "south", at: 0.5 },
        { label: "Coat hooks", wall: "west", at: 0.2 },
        { label: "Mirror", wall: "west", at: 0.6 },
      ],
    },
    {
      key: "kitchen",
      title: "Kitchen",
      x: 2,
      z: 0,
      w: 4,
      d: 4,
      h: 2.6,
      color: "#e8c46a",
      furniture: [
        { kind: "table", x: 2.4, z: 1.6 },
        { kind: "chair", x: 2.4, z: 0.7, rot: 180 },
        { kind: "chair", x: 2.4, z: 2.5 },
        { kind: "cabinet", x: 3.6, z: 3.2, rot: 90, color: "#ece6d8" },
      ],
      loci: [
        { label: "Fridge", wall: "east", at: 0.8, height: 2.3 },
        { label: "Stove", wall: "south", at: 0.5 },
        { label: "Kitchen table", wall: "north", at: 0.5 },
      ],
    },
    {
      key: "living",
      title: "Living room",
      x: 2,
      z: 4,
      w: 5,
      d: 4.5,
      h: 2.6,
      color: "#5b7fb5",
      furniture: [
        { kind: "sofa", x: 2.6, z: 0.6, rot: 180 },
        { kind: "armchair", x: 4.4, z: 2.4, rot: 90 },
        { kind: "tv", x: 2.6, z: 4.25 },
        { kind: "rug", x: 2.6, z: 2.3 },
        { kind: "lamp", x: 0.4, z: 4.1 },
        { kind: "plant", x: 4.6, z: 4.1 },
      ],
      loci: [
        { label: "Sofa", wall: "south", at: 0.5 },
        { label: "TV", wall: "north", at: 0.5 },
        { label: "Bookshelf", wall: "east", at: 0.5 },
      ],
    },
    {
      key: "bedroom",
      title: "Bedroom",
      x: 2,
      z: 8.5,
      w: 4,
      d: 3.5,
      h: 2.6,
      color: "#8c4a3c",
      furniture: [
        { kind: "bed", x: 2, z: 1.8 },
        { kind: "cabinet", x: 0.5, z: 3.2 },
      ],
      loci: [
        { label: "Bed", wall: "south", at: 0.6 },
        { label: "Wardrobe", wall: "north", at: 0.4 },
        { label: "Window", wall: "north", at: 0.8 },
      ],
    },
    {
      key: "bath",
      title: "Bathroom",
      x: 6,
      z: 8.5,
      w: 2.5,
      d: 3.5,
      h: 2.6,
      color: "#3f8f8f",
      furniture: [{ kind: "cabinet", x: 2.2, z: 1.8, rot: 90, color: "#ece6d8" }],
      loci: [{ label: "Bathroom mirror", wall: "north", at: 0.5 }],
    },
  ],
  doors: [
    { a: "hall", b: "kitchen", at: 0.5 },
    { a: "hall", b: "living", kind: "archway", width: 1.4 },
    { a: "hall", b: "bedroom", at: 0.25 },
    { a: "bedroom", b: "bath", width: 0.8, at: 0.75 },
  ],
};

export const TEMPLATES: PalaceTemplate[] = [PARTHENON, VETTII, TUTANKHAMUN, BAKER_STREET, LONG_ROOM, HOME];

export function templateById(id: string): PalaceTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------------- geometry

type Placed = { id: string; pos_x: number; pos_z: number; width: number; depth: number };
const placed = (r: TemplateRoom): Placed => ({ id: r.key, pos_x: r.x, pos_z: r.z, width: r.w, depth: r.d });
const WALLS: WallFace[] = ["north", "south", "east", "west"];
const OPPOSITE: Record<WallFace, WallFace> = { north: "south", south: "north", east: "west", west: "east" };

export interface DoorPlacement {
  a: { key: string; wall: WallFace; offset: number };
  b: { key: string; wall: WallFace; offset: number };
  kind: OpeningKind;
  width: number;
}

/**
 * Put each template door on the wall its two rooms share, centred at `at`
 * along the shared stretch (kept clear of the corners), and express it as a
 * wall offset in each room. Throws if two rooms don't share a wall that fits.
 */
export function placeDoors(t: PalaceTemplate): DoorPlacement[] {
  const byKey = new Map(t.rooms.map((r) => [r.key, r]));
  return t.doors.map((door) => {
    const ra = byKey.get(door.a);
    const rb = byKey.get(door.b);
    if (!ra || !rb) throw new Error(`${t.id}: door ${door.a}-${door.b} names a missing room`);
    const kind = door.kind ?? "door";
    const width = door.width ?? (kind === "door" ? 1 : 2);
    for (const wall of WALLS) {
      const la = wallLine(placed(ra), wall);
      const lb = wallLine(placed(rb), OPPOSITE[wall]);
      if (Math.abs(la.at - lb.at) > 1e-6) continue;
      const from = Math.max(la.from, lb.from);
      const to = Math.min(la.to, lb.to);
      if (to - from < width + 0.2) continue;
      const half = width / 2 + 0.1;
      const c = Math.min(to - half, Math.max(from + half, from + (to - from) * (door.at ?? 0.5)));
      const off = (l: { from: number; to: number }) => Math.round(((c - l.from) / (l.to - l.from)) * 1e6) / 1e6;
      return { a: { key: ra.key, wall, offset: off(la) }, b: { key: rb.key, wall: OPPOSITE[wall], offset: off(lb) }, kind, width };
    }
    throw new Error(`${t.id}: ${door.a} and ${door.b} share no wall wide enough for the door`);
  });
}

export interface TemplateWorld {
  level: Level;
  rooms: Room[];
  openings: Opening[];
  loci: Locus[];
}

const EPOCH = Date.UTC(2026, 0, 1);

/**
 * The template as in-memory palace rows (synthetic "tpl-" ids): what the
 * explore walk renders and what /api/palaces/from-template inserts.
 */
export function templateWorld(t: PalaceTemplate): TemplateWorld {
  const palaceId = `tpl-${t.id}`;
  const level: Level = { id: `${palaceId}:L0`, palace_id: palaceId, idx: 0, name: "Ground", elevation: 0, default_height: 3, created_at: new Date(EPOCH).toISOString() };
  const roomId = (key: string) => `${palaceId}:${key}`;
  const rooms: Room[] = t.rooms.map((r, i) => {
    const size = { width: r.w, depth: r.d };
    const furniture: FurnitureItem[] = (r.furniture ?? []).map((f, j) =>
      clampToRoom({ id: `f${j}`, kind: f.kind, x: f.x, z: f.z, rot: f.rot ?? 0, ...(f.color ? { color: f.color } : {}) }, size)
    );
    return {
      id: roomId(r.key),
      palace_id: palaceId,
      user_id: "template",
      title: r.title,
      background: r.color ?? null,
      metadata: { ...(furniture.length ? { furniture } : {}), ...(r.hallway ? { kind: "hallway" } : {}) },
      width: r.w,
      depth: r.d,
      height: r.h ?? 3,
      level_id: level.id,
      pos_x: r.x,
      pos_z: r.z,
      rotation: 0,
      outline: null,
      created_at: new Date(EPOCH + i * 1000).toISOString(),
    };
  });
  const roomByKey = new Map(t.rooms.map((r, i) => [r.key, rooms[i]]));
  const openings: Opening[] = [];
  placeDoors(t).forEach((d, i) => {
    const a = roomByKey.get(d.a.key)!;
    const b = roomByKey.get(d.b.key)!;
    const row = (room: Room, side: DoorPlacement["a"], target: Room, n: string): Opening => ({
      id: `${room.id}:o${i}${n}`,
      room_id: room.id,
      wall: side.wall,
      wall_offset: side.offset,
      width: Math.round((d.width / (side.wall === "east" || side.wall === "west" ? room.depth : room.width)) * 1e4) / 1e4,
      width_m: d.width,
      kind: d.kind,
      target_room_id: target.id,
      created_at: new Date(EPOCH).toISOString(),
    });
    openings.push(row(a, d.a, b, "a"), row(b, d.b, a, "b"));
  });
  const loci: Locus[] = t.rooms.flatMap((r) => {
    const room = roomByKey.get(r.key)!;
    const size = { width: r.w, depth: r.d };
    return (r.loci ?? []).map((l, i) => {
      const pct = locusPercent({ wall: l.wall, wall_offset: l.at, x: 0, y: 0 }, size);
      const p = wallPoint(l.wall, l.at, size);
      return {
        id: `${room.id}:l${i}`,
        room_id: room.id,
        x: Math.round(pct.x * 100) / 100,
        y: Math.round(pct.y * 100) / 100,
        z: Math.round(p.z * 100) / 100,
        label: l.label,
        tags: [],
        position: i,
        wall: l.wall,
        wall_offset: l.at,
        height: l.height ?? 1.6,
        created_at: new Date(EPOCH + i).toISOString(),
      };
    });
  });
  return { level, rooms, openings, loci };
}

/** Top-down plan for a gallery thumbnail. */
export function templatePlan(t: PalaceTemplate): Blueprint | null {
  const w = templateWorld(t);
  return levelPlanFor(w.rooms, w.loci, w.openings, [w.level], w.rooms[0].id);
}

/** Room / loci / furniture counts for the gallery card. */
export function templateStats(t: PalaceTemplate): { rooms: number; loci: number; furniture: number } {
  return {
    rooms: t.rooms.length,
    loci: t.rooms.reduce((n, r) => n + (r.loci?.length ?? 0), 0),
    furniture: t.rooms.reduce((n, r) => n + (r.furniture?.length ?? 0), 0),
  };
}

/** Every furniture kind used, for sanity checks. */
export function templateFurnitureKinds(t: PalaceTemplate): FurnitureKind[] {
  return [...new Set(t.rooms.flatMap((r) => (r.furniture ?? []).map((f) => f.kind)))].filter((k) => k in FURNITURE);
}
