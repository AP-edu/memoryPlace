# Wireframes

Drop PDF wireframes in `docs/product/wireframes/` next to this file.

## Why text summaries too

### **Palace Overview — 2D Blueprint**

The Palace Overview shows the entire palace as a clean top‑down blueprint made of rectangular rooms. It must let the user create rooms, resize them, set themes, and choose whether each connecting wall uses a door or an archway. It also serves as the entry point into both the Room Editor and the 3D Walk Mode, making it the central hub of spatial design.

---

### **Room Editor — 2D Blueprint**

The Room Editor shows a single room in top‑down view with clearly segmented walls and snap points for loci. It must allow placing wall‑anchored loci, naming the room, adjusting its theme, and toggling door or archway transitions. This screen defines the spatial mnemonic structure of each room.

---

### **Loci Placement Panel**

The Loci Placement Panel shows a close‑up of a wall segment with a snap grid and a palette of locus types (floating icon or plaque). It must let users place loci precisely, attach cards or mnemonic cues, and choose the visual style of each locus. This screen ensures loci are intentional, memorable, and spatially anchored.

---

### **3D Walk Mode — First‑Person**

The 3D Walk Mode shows the palace from a first‑person perspective with soft lighting, flat colors, and minimal UI. It must allow smooth walking, turning, approaching loci, revealing cards, and transitioning through doors or archways. This is the core mnemonic training environment where spatial recall is strengthened.

---

### **Study Session — Spatial Quiz**

The Study Session shows a lightweight overlay tied to the user’s current locus in the 3D space. It must present the question, reveal the answer, record the user’s self‑grade, and move to the next locus in spatial order. This screen merges active recall with spatial navigation.

---

### **Session Summary & Analytics**

The Session Summary shows the results of a study session: score, mastery per room, streak, and weak cards. It must highlight which loci need reinforcement, allow quick edits, and link back to the relevant room or locus. This screen closes the loop between spatial practice and measurable progress.

---

### **Card Editor — Locus Detail**

The Card Editor shows the card attached to a locus, including front, back, explanation, and optional media. It must allow creating or editing cards, choosing card type, and saving changes directly to the locus. This screen ensures mnemonic content is tightly bound to spatial anchors.

---

### **Palace Export — Printable Blueprint**

The Palace Export screen shows a simplified top‑down blueprint with room labels and locus markers. It must allow exporting a printable version and a plain text blueprint so users can reconstruct the palace mentally outside the app. This supports the core goal of real‑world mnemonic transfer.

---

### **Onboarding Guided Tour**

The Onboarding Tour shows step‑by‑step overlays guiding the user through creating their first room, placing loci, entering 3D Walk Mode, and completing a short study session. It must teach the spatial workflow quickly and clearly, ensuring users understand the mnemonic purpose of each step.

| Screen                                  | Shows                                                                                                                        | Must do                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Palace Overview (2D blueprint)**      | Top‑down view of the single palace with rectangular room tiles, room thumbnails, and primary palace selector                 | Create/resize rooms; toggle door/archway per wall; set room theme; enter Room Editor; enter 3D Walk Mode                   |
| **Room Editor (2D blueprint)**          | Single room top‑down with wall grid, wall segments, and locus snap points                                                    | Place wall‑anchored loci; toggle door vs archway on walls; name room; set theme color; preview 3D transition points        |
| **Loci Placement Panel**                | Wall close‑up showing snap grid, locus palette (icons/plaques), and attachable card list                                     | Drag/select locus icon; snap to wall; attach/create card; choose plaque vs floating icon; set locus label                  |
| **3D Walk Mode (First‑person)**         | First‑person view of the room with soft lighting, minimal HUD, visible loci as icons/plaques, and door/archway transitions   | Walk/turn; approach locus to reveal card; open card detail; animate door/archway transitions; return to 2D builder         |
| **Study Session (Spatial Quiz)**        | Overlay sequence showing current locus, question area, reveal button, and self‑grade controls tied to spatial order          | Present locus‑tied question; reveal answer; record response; advance to next locus; log session results                    |
| **Session Summary & Analytics**         | Session score, per‑room mastery, streak, cards reviewed, weak cards list, and quick edit links                               | Show retention metrics; list weak cards with quick edit; allow reschedule or reassign to loci; link back to room and locus |
| **Card Editor (Locus detail)**          | Card front/back editor, explanation field, media upload placeholder, and card type selector                                  | Create/edit card; attach image/audio; choose card type (basic/cloze/MCQ); save to locus                                    |
| **Palace Export / Printable Blueprint** | Printable top‑down blueprint with room labels, locus markers, and simple textual blueprint for mental reconstruction         | Export printable PDF; export plain text blueprint (room order, wall loci sequence) for offline practice                    |
| **Onboarding Guided Tour**              | Step‑by‑step overlay that walks user through creating first room, placing 5 loci on walls, and running first 10‑card session | Guide user through builder → place loci → 3D walk → first session; mark onboarding complete and unlock analytics           |

## Priority

Palace Overview (2D blueprint) — defines spatial rules and builder ergonomics.

Room Editor (2D blueprint) and 3D Walk Mode — complete the core loop (design → place loci → embodied practice).

Study Session and Session Summary — validate training and retention mechanics.
