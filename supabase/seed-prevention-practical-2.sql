-- ============================================================
-- Backfill v1: Prevention Practical 2 (51 cards, 5 stacks)
-- Run in the Supabase SQL Editor.
-- For each user: deletes any previous Prevention Practical 2 starter stacks,
-- then inserts the fresh v1 content.
-- ============================================================

DO $$
DECLARE
  target_user_id UUID;
  v_deck_id UUID;
  v_done INT := 0;
BEGIN
  FOR target_user_id IN SELECT id FROM auth.users LOOP

    DELETE FROM public.flashcard_cards
      WHERE deck_id IN (
        SELECT id FROM public.flashcard_decks
        WHERE user_id = target_user_id
          AND source_pdf_name LIKE '__starter:prevention-practical-2-v%%'
      );
    DELETE FROM public.flashcard_decks
      WHERE user_id = target_user_id
        AND source_pdf_name LIKE '__starter:prevention-practical-2-v%%';

    -- Stack 1: HIV, standard precautions, and PPE
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'Prevention Practical 2 01. HIV, standard precautions, and PPE',
      'Cards 01-10 from Prevention Practical 2: HIV transmission, standard precautions, gloves, masks, goggles, gowns, and PPE donning/removal.',
      '__starter:prevention-practical-2-v1__:stack-01',
      10,
      10,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Modes of HIV transmission in dental medicine**',
      '• **Main real risks:** needle-stick/percutaneous exposure about **0.3%** (about 1 in 300).

• Mucous membrane splash risk about **0.09%** (about 1 in 1000).

• Splash on non-intact skin = low risk and lower than **mucous membrane exposure**.

• **HIV** is not transmitted by touching dried blood on surfaces.

• Key dental danger = fresh blood exposure through sharps, wounds, eyes, nose, or mouth.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Infection control in dental medicine. Universal/Standard precautions**',
      '• **Universal Precautions:** treat all blood and blood-contaminated fluids as infectious for every patient.

• **Standard Precautions:** extend protection to all body fluids except sweat, especially with broken skin or mucosa.

• Rules depend on the procedure and exposure risk, not on who the patient is.

• **Core measures:** **PPE**, **hand hygiene**, **disinfection**, **sterilization**, **sharps injury prevention**, and **contaminated waste management**.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Types of gloves**',
      '• **Examination gloves:** for clinical exams and non-surgical care; sterile or non-sterile; **single-use**.

• **Surgical gloves:** sterile and **single-use**; used for surgical procedures.

• **Non-medical gloves:** for cleaning, **disinfection**, chemicals, and sharps handling; never used on patients.

• **Common materials:** latex, nitrile, vinyl/polyvinyl, polyurethane, chloroprene, rubber/copolymers.

• Choose gloves according to clinical risk, allergy risk, and resistance needed.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Gloves. Usage rules**',
      '• Wear gloves for all clinical procedures; change after each patient or if damaged.

• Never wash, disinfect, sanitize, or reuse gloves; this can create microcracks and contamination.

• **Gloves do not replace hand hygiene:** clean hands before use and after removal.

• Remove gloves by turning the contaminated outside inward.

• Avoid touching objects outside the operative field with contaminated gloves; use clean over-gloves, tongs, or paper towels if needed.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Gloves. Preventive measures against allergic reactions**',
      '• Latex allergy is more frequent in dental staff (about **6-17%**) than in the general population.

• **Reduce exposure to latex proteins:** use latex only when needed for infectious protection.

• Prefer **low-protein**, **powder-free** latex gloves.

• Use **synthetic gloves** for latex-allergic people.

• Avoid touching eyes/face with gloves; wash hands after use to remove powder or latex residues.

• Educate staff about allergy risks and prevention.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Masks**',
      '• **Purpose:** protect staff from **aerosols**, **droplets**, and **splashes** of blood or body fluids.

• Mask must cover mouth and nose, fit under the chin, and be adjusted tightly at the nose.

• Change after each patient, or when moist or damaged.

• Do not wear the mask on the neck, chin, or nape because it becomes contaminated.

• Use **filter masks** for patients with confirmed infectious status.

• Efficiency is best early in use, before the mask becomes moist.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Goggles. Face shield**',
      '• Protect against particles, light radiation, chemicals, and microbes such as **HBV**.

• Can be glass or plastic, clear or tinted/UV-protective.

• Handle glasses only by the side arms/temples, after removing contaminated gloves and cleaning hands.

• Decontaminate by disinfecting, respecting **contact time**, rinsing, disinfecting/immersing again, rinsing, and drying.

• Some goggles can be autoclaved if manufacturer allows it.

• Face shield/visor gives full-face protection.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Personal protective equipment. Medical gown**',
      '• Protects staff clothing and skin from physical, chemical, and biological contamination.

• Should cover chest, arms, and lower body; sleeves/cuffs should fit under gloves.

• Wear only inside the medical facility.

• Change daily or immediately if wet, damaged, or contaminated.

• Dispose in special bags/containers using **PPE**.

• Wash with hot water/detergent or chlorine solution, then hot-air dry and iron.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Protocol for donning protective equipment**',
      '• **1. Gown:** long sleeves, knee length or two-piece outfit, tied at back/neck/chest.

• **2. Mask:** cover mouth, nose, and chin; secure straps/elastics; mold nose strip.

• **3. Goggles/face shield:** put on by handling the side arms.

• **4. Gloves:** remove jewelry, perform **hand hygiene**, dry hands, then put gloves over gown cuffs.

• Correct order prevents clean items from becoming contaminated too early.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Protocol for removing protective equipment**',
      '• Remove **PPE** before leaving the office; remove/discard the mask after exiting and closing the door.

• **Gloves:** peel outside inward and discard in **biohazard waste**.

• **Goggles/face shield:** contaminated outside; handle only by side arms/temples.

• **Gown:** contaminated outside and sleeves; touch inside only and roll inward.

• **Mask:** do not touch the front; remove by straps only.

• Wash hands immediately after **PPE** removal.'
    );

    -- Stack 2: Patient protection, hand hygiene, respiratory and waterline controls
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'Prevention Practical 2 02. Patient protection, hand hygiene, respiratory and waterline controls',
      'Cards 11-20 from Prevention Practical 2: patient protection, hand hygiene, airborne/respiratory/TB prevention, dental unit waterline biofilms, and blood-borne disease risks.',
      '__starter:prevention-practical-2-v1__:stack-02',
      10,
      10,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Equipment for patient protection**',
      '• **Aim:** protect the patient from **splashes**, **aerosols**, materials, and contamination during treatment.

• **Main items:** protective films, disposable protective gown, facial mask when needed, head cap, protective glasses, and bib.

• Use **single-use** or properly disinfected items for each patient.

• Patient protection also helps keep the dental unit and surrounding area cleaner.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Hand hygiene: Indications**',
      '• Before direct contact with a patient.

• Before putting on any type of gloves.

• After each patient and after glove removal.

• After handling blood or saliva contaminated with blood.

• After touching the patient’s intact skin, such as blood pressure or pulse measurement.

• After touching objects or medical equipment near the patient.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Hand hygiene: Hygienic circumstances and products**',
      '• Do **hand hygiene** before patient contact and gloves; after patient contact, blood/saliva, nearby objects, and glove removal.

• **Basic products:** simple soap or antimicrobial soap.

• **Higher decontamination:** alcohol-based rubs, chlorhexidine gluconate, iodine/iodophors.

• **Other agents:** quaternary ammonium compounds, triclosan, chloroxylenol, hexachlorophene.

• **Choose product based on the situation:** simple wash, antimicrobial wash, surgical wash, or rapid alcohol decontamination.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Hand hygiene: Simple technique**',
      '• Remove jewelry and accessories from hands/wrists.

• Wet hands and wrists with warm running water; apply enough soap.

• Rub all hand surfaces for **15-30 seconds**.

• Rinse with water flowing from hands toward forearms.

• Dry hands/wrists completely before putting on gloves.

• Cover palms, backs of hands, between fingers, backs of fingers, thumbs, and rotational rubbing areas.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Procedure to prevent airborne infection transmission**',
      '• Use Standard/Universal Precautions and **PPE**.

• **Ask for pre-procedural antiseptic mouth rinse:** chlorhexidine, povidone-iodine, essential oils, etc.

• Use **rubber dam** for strong **isolation** of the operative field.

• Ensure good **ventilation** and air circulation.

• Use **air purification devices** when needed, such as antimicrobial filters or UV lamps.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Procedure to prevent infection transmission during seasonal epidemics, respiratory viral infections, and influenza**',
      '• **For respiratory symptoms:** isolate patient in a closed room; give mask/tissues and no-touch bins.

• Patient wears a mask when leaving the dental office.

• **Staff uses PPE:** surgical mask, gloves, protective glasses; **hand hygiene** after contact.

• Delay non-urgent treatment and increase cleaning/disinfection during flu season.

• **Confirmed H1N1 emergency:** urgent care only, **N95 mask** + **full PPE**, avoid **aerosols** and coughing triggers.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Procedure to prevent tuberculosis transmission during dental treatments**',
      '• **Main controls:** **early detection**, **isolation**, **environmental control**, and **respiratory protection** for staff.

• Screen patient history and TB symptoms; restrict symptomatic healthcare personnel until diagnosis is clarified.

• **Active TB**, symptomatic positive skin test, or unknown treatment history: **emergency treatment only** until status is confirmed.

• **Use special conditions if emergency care is required:** **isolation** room, air filtration, respiratory masks, scheduled appointment.

• Adequately treated TB with negative sputum cultures/completed therapy: treat as healthy patient.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Control of water contamination in the dental unit network. Microbial biofilms**',
      '• **Dental unit waterlines can develop biofilm:** microbes stick to inner tubing and form a multi-species film.

• Waterline design, slow flow, and large surface area promote bacterial growth.

• Microbial counts can become very high, even hundreds of thousands of CFU/mL within days.

• Safe water targets are low; Romania/US reference commonly uses less than **500 CFU/mL**.

• Biofilm matters because contaminated water spray can expose patients and staff.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Procedure to prevent infection transmission from the dental unit water network**',
      '• Flush **waterlines** for several minutes before/during clinical activity and between sessions.

• Use **anti-retraction devices** to prevent backflow contamination.

• Use **microbial filters**, purification devices, or **independent water systems**.

• Treat water intermittently or continuously with **biocides** such as iodophores, sodium hypochlorite, **glutaraldehyde**, or isopropanol.

• Test water quality periodically and train staff to monitor it.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Prevention of blood-borne infection transmission in dental medicine. Risk of transmission of major blood-borne diseases**',
      '• **HBV:** important occupational risk; percutaneous injury risk can be about **22-31%**; survives in dried blood for at least 1 week.

• **HCV:** less efficiently transmitted; accidental **percutaneous exposure** average about **1.8%**; skin exposure transmission not documented.

• **HIV:** **percutaneous exposure** about **0.3%**; **mucous membrane exposure** about **0.09%**; non-intact skin risk lower.

• Main dental danger = blood exposure through **sharps injuries** or **splashes** to mucosa/non-intact skin.'
    );

    -- Stack 3: Sharps, post-exposure care, instruments, and disinfection
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'Prevention Practical 2 03. Sharps, post-exposure care, instruments, and disinfection',
      'Cards 21-30 from Prevention Practical 2: sharps safety, needle handling, post-exposure prophylaxis, reusable instrument processing, disinfection levels, surfaces, barriers, and operator-area preparation.',
      '__starter:prevention-practical-2-v1__:stack-03',
      10,
      10,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Prevention of blood-borne infection transmission in dental medicine. Procedure to prevent exposure to sharp objects**',
      '• Train staff about sharps risks, prevention, and **incident reporting**.

• Follow healthcare worker safety rules and safe clinical routines.

• Use **PPE** consistently and dispose of contaminated waste correctly.

• Use **protective sharps technologies**, especially during high-risk procedures.

• After exposure, respond immediately and report the incident.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Prevention of blood-borne infection transmission in dental medicine. Handling of contaminated syringes and needles**',
      '• Keep needles/syringes visible and dispose immediately in biohazard **sharps containers**.

• Do not recap, bend, break, or point contaminated needles toward the body.

• If another anesthetic puncture is needed on the same patient, use another needle.

• If recapping is unavoidable, use one-handed scoop technique or a mechanical device.

• Safety devices should keep hands behind the needle, be reliable/easy, and not reduce medical quality.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Prevention of blood-borne infection transmission in dental medicine. Post-exposure prophylaxis for blood-borne transmissible accidental exposure**',
      '• A contaminated sharp injury is a **medical emergency**.

• **Immediate local care:** wash wound with soap/water; rinse mouth/nose/skin with water; rinse eyes with water/saline/sterile solution.

• Report the incident immediately to the supervisor.

• **Assess risk:** virus involved, exposure type, blood amount, source viral load/status.

• If source status is unknown, inform exposed person; test source only with legal consent and confidentiality.

• Choose **PEP/treatment** and provide counselling/support.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Processing of reusable instruments in dental medicine. Cleaning and disinfection**',
      '• **Wear PPE:** **resistant gloves**, goggles, and mask.

• **Manual cleaning:** immerse 15 min in **enzymatic detergent/disinfectant**, brush joints/retentive zones, rinse well.

• Use labelled, covered containers with solution name, concentration, and **contact time**.

• Prefer **automatic washer-disinfectors** when possible.

• **Ultrasonic cleaning** is safer and 1-9x more efficient; ideal for sharp instruments and burs.

• **Ultrasonic steps:** prepare solution, run 5 min to remove air, load trays, clean about 16 min, rinse, dry.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Processing of reusable instruments in dental medicine. Preparation, packaging, and storage**',
      '• Immediately place used instruments in **enzymatic detergent** to prevent debris from drying.

• Clean mechanically if possible, disinfect for required time, rinse, and dry completely.

• Inspect with good light/magnification; lubricate hinged tools with water-based sterilization-compatible lubricant.

• Package in **single-use** pouches/wraps/rigid containers; label date, contents, and sterilizer cycle.

• Seal, sterilize, then store in a clean, dry, safe area.

• Use **FIFO**; if packaging is damaged, repackage and resterilize.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Disinfection in dental medicine: Levels of disinfection**',
      '• **High-level:** destroys all microorganisms except bacterial spores; examples **glutaraldehyde**, hydrogen peroxide, peracetic acid.

• **Intermediate-level:** inactivates Mycobacterium tuberculosis, vegetative bacteria, and most viruses, not spores.

• **Intermediate examples:** hypochlorite/halogens, iodophors, phenolics, some quats with alcohol, chlorhexidine.

• **Low-level:** destroys most bacteria, some viruses, and fungi, but not TB or spores.

• **Low-level examples:** quaternary ammonium compounds and detergents.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Disinfection in dental medicine: Disinfectants; disinfection steps**',
      '• **Step 1 - Cleaning:** physically removes dirt, organic matter, and reduces microorganisms.

• **Step 2 - Disinfection:** destroys or inactivates pathogens left after cleaning.

• **Common disinfectant families:** chlorine/halogens, aldehydes, alcohols, phenols, oxidants, surfactants/quats, and biguanides/chlorhexidine.

• **Never skip cleaning:** organic debris reduces disinfectant effectiveness.

• Always respect manufacturer concentration and **contact time**.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Disinfection in dental medicine: Surface disinfection techniques**',
      '• Surface choice depends on contamination risk and surface type.

• **Risk categories:** critical, semi-critical, non-critical intraoral contact, non-critical skin contact, environmental patient-care, and auxiliary areas.

• **Spray-Wipe-Spray:** spray disinfectant, wipe with disposable towel, spray again, leave full **contact time**.

• **Wipe-Discard-Wipe:** wipe/clean with disinfectant wipe, discard, wipe/disinfect with a fresh wipe, discard.

• Use barriers or **disinfection** based on how often the surface is touched or contaminated.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Using physical barriers to protect equipment and surfaces**',
      '• **Physical barriers** cover equipment/surfaces to prevent contamination by blood or body fluids.

• **Materials:** impermeable paper, aluminum foil, plastic covers, or plastic bags.

• Use on surfaces likely to be touched or splashed during treatment.

• Wear **PPE** when removing and replacing barriers.

• Discard contaminated barriers in regulated **biohazard containers**.

• Apply clean barriers for every new patient.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. Preparing an operator area for each patient**',
      '• Flush **waterlines** for **30 seconds**; run **ultrasonic scaler** **3 minutes** if used.

• Cover or disinfect chair, lights, switches, keyboard, instrument table, X-ray items, and other touched surfaces.

• Attach **saliva ejector**, high-volume evacuator, sterile handpieces, and air/water syringe; place waste bag.

• Prepare **sterile instrument kits** after checking indicators; set only needed materials in small dishes near the dentist.

• Cover tray/table and disinfect after patient; close doors/drawers; keep personal items in a clean area.'
    );

    -- Stack 4: Dental office preparation and sterilization methods
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'Prevention Practical 2 04. Dental office preparation and sterilization methods',
      'Cards 31-40 from Prevention Practical 2: patient/procedure/end-of-day/weekly dental office preparation and moist heat, dry heat, cold chemical, vapor, and ethylene oxide sterilization.',
      '__starter:prevention-practical-2-v1__:stack-04',
      10,
      10,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. Patient preparation**',
      '• Seat the patient and place a bib.

• Give protective eyewear.

• Ask the patient to rinse with antiseptic solution for **15-30 seconds**, such as chlorhexidine.

• Adjust chair and dental light to the correct position.

• Place **saliva ejector** and tell patient not to close lips around it to avoid reverse aspiration.

• **Goal:** protect patient and reduce microbial load before care.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. During a clinical procedure**',
      '• **Use four-handed dentistry:** dentist and assistant work together.

• Wear **full PPE** and keep instruments organized.

• Be especially careful with sharps and used needles.

• Respect dentist and assistant working zones.

• **Apply the no-touch principle:** do not touch records, radiographs, or dropped instruments with contaminated gloves.

• Disinfect clinical items used, such as models and occlusion records.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. After each treatment**',
      '• Remove gloves, perform **hand hygiene**, and complete documentation in the **clean zone**.

• Put on **thick utility gloves**; transport dirty instruments safely and discard sharps in **rigid biohazard containers**.

• Throw **single-use** items into infectious waste.

• Run handpieces **30 seconds**, clean visible debris, and send for **sterilization**.

• Remove barriers; clean and disinfect uncovered or contaminated surfaces.

• Reprocess eyewear, remove **PPE** safely, wash hands, and prepare chair/floor for cleaning.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. At the end of the day**',
      '• Clean and disinfect all operatory surfaces and equipment.

• **Use the two-step method:** clean first, then disinfect.

• **Spray-Wipe-Spray** method may be used; respect **contact time**, often about **10 minutes** if specified.

• Clean the dental unit water system to reduce contamination.

• Clean the sink and amalgam separator filter.

• Leave the operatory ready for safe next-day use.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental office preparation. Weekly procedures**',
      '• **Deep clean/disinfect operatory surfaces:** walls, shelves, lights, chair upholstery.

• Disassemble/clean light arms and handles; inspect suction hoses, **waterlines**, and holders.

• Perform **shock/deep disinfection** of dental unit **waterlines**.

• **Clean sterilization equipment:** **autoclaves**, ultrasonic baths, cassettes, containers.

• Maintain equipment and handpieces; clean traps, filters, reservoirs.

• Clean admin/waiting/storage areas; check expiry dates; disinfect waste containers and replace labels/bags.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Sterilization by moist heat**',
      '• **Indicated** for soft materials, glass, porcelain, rubber, handpieces, and instruments.

• **Advantages:** fast, good steam penetration, allows packaging, processes many items.

• **Steps:** clean/decontaminate/dry; disassemble/space items; pack/tray; load autoclave with space for steam.

• Follow manufacturer time, pressure, and temperature.

• **Gravity autoclave:** **121 deg C** for 15-30 min; **pre-vacuum**: **132 deg C** for 3.5-10 min.

• Timing starts at target temperature; open after pressure drops; dry about 30 min, cool, store clean/dry.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Sterilization by dry heat**',
      '• **Indicated** for metal instruments, endodontic tools, glass, porcelain, powders, and oils.

• **Advantages:** non-corrosive, preserves sharp edges, low cost.

• **Steps:** clean/decontaminate/dry; wrap or place in metal trays; heat until target temperature.

• **Times:** **190 deg C** 12 min forced air; **170 deg C** 1 h; **160 deg C** 2 h; **150 deg C** 2.5 h; **140 deg C** 3 h.

• For sharp instruments/needles, do not exceed **160 deg C**.

• Cool inside oven; wrapped items stay sterile while package is intact/dry; unwrapped items must be used immediately.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Chemical sterilization (cold)**',
      '• Uses long immersion in germicidal solutions such as **glutaraldehyde**, hydrogen peroxide, peracetic acid, or combinations.

• Difference from **high-level disinfection** = longer **contact time**.

• **Less recommended:** cannot be biologically monitored, needs strict sterile rinsing/drying, depends on solution quality, and takes **6-10 h** or more.

• Use only for heat-sensitive instruments when no disposable option exists.

• **Steps:** clean/dry, prepare labelled solution, fully immerse, wait **10-12 h** for **glutaraldehyde**, remove with sterile forceps, rinse sterile water, dry/store sterile closed container up to 1 week.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Chemical vapor sterilization under pressure**',
      '• **Chemiclave** uses chemical vapors under pressure, mainly aldehydes.

• **Typical cycle:** **132 deg C** for 20 min at about 1.5 atm.

• Vapor may include formaldehyde, ethanol, acetone/ketones, water, or other alcohols.

• **Indicated** for instruments, burs, needles, and some soft materials.

• **Advantage:** helps prevent corrosion or degradation of metal instruments.

• **Disadvantage:** may damage heat-sensitive materials.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Ethylene oxide chemical sterilization**',
      '• Best for complex instruments and delicate or heat-sensitive materials.

• **EtO gas** penetrates internal and complex structures.

• Automated high-temperature systems, slightly below 100 deg C, sterilize in a few hours.

• Low-temperature/room-temperature systems need about **12 hours**.

• Porous and plastic materials absorb the gas.

• **Aeration** for more than **24 h** is required before contact with skin or tissues.'
    );

    -- Stack 5: Monitoring, handpieces, organization, zones, waste, equipment, and ergonomics
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'Prevention Practical 2 05. Monitoring, handpieces, organization, zones, waste, equipment, and ergonomics',
      'Cards 41-51 from Prevention Practical 2: sterilization monitoring, handpiece contamination control, four-handed dentistry, contamination zones, waste management, chair/unit selection, and posture.',
      '__starter:prevention-practical-2-v1__:stack-05',
      11,
      11,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Sterilization monitoring**',
      '• **Physical indicators:** record time, temperature, and pressure.

• **Chemical indicators:** color-changing dyes/chemicals checking one or more cycle parameters.

• **Chemical indicator types:** external, internal, and multi-parameter internal.

• **Biological indicators:** best proof; dried bacterial spores on strips should be destroyed if **sterilization** succeeded.

• **Documentation:** keep daily/weekly records and date every sterilized pack for traceability.

• Monitoring proves the cycle worked, not just that the machine ran.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Contamination control of handpieces**',
      '• **Handpieces** are semi-critical and hard to disinfect because external and internal parts get contaminated with blood/saliva.

• Only safe complete method = **monitored sterilization**, not simple surface **disinfection**.

• **Standard cycle:** cleaning, decontamination, packaging, **sterilization**, storage.

• **Metal:** wash with detergent, dry, lubricate before/after **sterilization**, pouch, autoclave.

• **Ceramic:** no lubrication; avoid damaging chemicals; clean, package, autoclave/chemiclave if suitable.

• **Optical fibers:** clean with detergent and isopropyl alcohol; residual oil/debris can damage the fiber tip.

• **EtO** penetrates internal parts well but is slow and needs very clean instruments.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Principles of organizing activity in the dental office**',
      '• Place tools/equipment intelligently to reduce movement, strain, and stress.

• Remove unnecessary tools, steps, and devices.

• Use **multi-use tools** when appropriate, such as **rubber dam** or double-ended instruments.

• **Standardize procedures** to save time and reduce mistakes.

• Place items according to frequency of use; rarely used items can be stored or placed on mobile units.

• **Goal:** less fatigue, better posture, faster and safer workflow.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**The concept of four-handed dentistry. Operational zones**',
      '• Dentist and assistant work as a coordinated team to reduce movement, fatigue, and stress.

• **Benefits:** faster care, better efficiency, less physical strain, better posture, improved infection control.

• **Dentist zone:** 8-11 o’clock.

• **Assistant zone:** 2-5 o’clock, for suction and instruments.

• **Transfer zone:** 5-8 o’clock, for passing instruments.

• **Static zone:** 11-2 o’clock, for equipment not actively used.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**The concept of limited contamination. Contamination zones**',
      '• **Zone 1 - high risk:** within about 1 m of the mouth; direct blood/saliva contact; disinfect before and after each patient.

• **Zone 2 - medium risk:** rarely used but possibly contaminated items, such as syringe or **rubber dam**; disinfect if used.

• **Zone 3 - low risk:** material preparation area; use barriers or disinfect if contaminated.

• **Zone 4 - clean zone:** keyboard, desk, doors, computer; protect with covers and avoid contaminated gloves.

• Keep clean and contaminated zones separated to limit cross-contamination.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Waste management in the dental office**',
      '• Wear **full PPE**, including puncture-resistant gloves; use protective apron if needed.

• Needles/syringes go in puncture-resistant, leak-proof, certified or color-coded **sharps containers**.

• Keep **sharps containers** close to the dental chair and below eye level.

• **Segregate waste correctly:** sharps, infectious waste, chemical waste, and general waste.

• Recycle non-hazardous paper, plastic, glass, and aluminum when possible.

• Label and store waste according to biohazard rules.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Criteria for selecting equipment in dental offices. Medical chair**',
      '• Designed for sit-down dentistry and balanced working posture.

• Padded for comfort and to protect the spine/back.

• Adjustable vertically and horizontally.

• Rotating base allows easier positioning.

• **Goal:** reduce fatigue while keeping the operator stable and efficient.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Criteria for selecting equipment in dental offices. Assistant''s chair**',
      '• Padded and stable for long procedures.

• Rotating base with 5 legs.

• Metal foot ring supports the feet because the assistant works higher than the dentist.

• Backrest must not interfere with instrument transfer.

• Backrest should not be used as arm support.

• **Goal:** good visibility and mobility without disturbing workflow.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Criteria for selecting equipment in dental offices. Patient''s chair**',
      '• Solid, stable base; can move up/down and recline/decline.

• Comfortable for the patient.

• Allows good access and visibility for dentist and assistant.

• Slim, short backrest and armrests let the team get close without effort.

• Dental unit should be in the transfer zone so instruments are reachable without disrupting workflow.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Dental unit. Handling systems**',
      '• **Over-the-patient delivery system**.

• **Side delivery system**.

• **Split delivery system**.

• **Rear delivery system:** instruments delivered from behind.

• **Trans-thoracic delivery system:** presented in the notes as the best option.

• Choice affects ergonomics, access, and team workflow.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '**Ergonomic principles of work organization in the dental office. Posture adoption**',
      '• Back 10-20 degrees from hips; avoid trunk rotation.

• Head about 25 degrees; shoulders relaxed; chest forward and up.

• Upper arm 10-15 degrees and close to body; elbow about 90 degrees; eyes 35-40 cm from mouth.

• Thigh/lower-leg angle about 110 degrees; thighs max 45 degrees; knees lower than hips; feet flat.

• Support forearms/fingers or use patient’s head for stability; keep wrists supported.

• Take short breaks and strengthen core/spine; assistant sits 10-20 cm higher than dentist.'
    );

    v_done := v_done + 1;
  END LOOP;
  RAISE NOTICE 'Prevention Practical 2 backfill complete: % users updated', v_done;
END $$;
