-- ============================================================
-- Backfill v4: CDC / Attache starter deck (154 cards, 11 stacks)
-- Run in the Supabase SQL Editor.
-- For each user: deletes any previous starter deck (v1..v4),
-- then inserts the fresh v4 content.
-- ============================================================

DO $$
DECLARE
  target_user_id UUID;
  v_deck_id UUID;
  v_done INT := 0;
BEGIN
  FOR target_user_id IN SELECT id FROM auth.users LOOP

    -- Delete all previous starter deck versions for this user
    DELETE FROM public.flashcard_cards
      WHERE deck_id IN (
        SELECT id FROM public.flashcard_decks
        WHERE user_id = target_user_id
          AND source_pdf_name LIKE '__starter:cdc-attache-v%%'
      );
    DELETE FROM public.flashcard_decks
      WHERE user_id = target_user_id
        AND source_pdf_name LIKE '__starter:cdc-attache-v%%';

    -- Stack 1: La Caisse des Dépôts — identité, statut, textes
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 01. La Caisse des Dépôts — identité, statut, textes',
      'Les 24 fondamentaux à savoir sur la CDC : création, statut juridique, textes structurants, gouvernance, missions historiques et investisseur de long terme.',
      '__starter:cdc-attache-v4__:stack-01',
      24,
      24,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Date de création de la CDC ?',
      '**La Caisse des Dépôts a été créée par la loi du 28 avril 1816 sous Louis XVIII, pour restaurer la confiance dans les finances publiques après les guerres napoléoniennes.**

Loi du 28 avril 1816, sous Louis XVIII, après les guerres napoléoniennes qui avaient ruiné la confiance dans les finances publiques.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quels sont les 3 grands textes structurants de la CDC ?',
      '**Les trois textes structurants sont la loi de création du 28 avril 1816, la loi LME du 4 août 2008 qui modernise la gouvernance et soumet la CDC à la supervision prudentielle de l''ACPR, et la loi PACTE du 22 mai 2019 qui rapproche la CDC de La Poste et élargit ses missions.**

Loi du 28 avril 1816 (création), loi LME du 4 août 2008 (modernisation, supervision prudentielle ACPR), loi PACTE du 22 mai 2019 (rapprochement avec La Poste, élargissement des missions).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que dit la loi de 1816 ?',
      '**L''article 110 de la loi de 1816 confie à un établissement spécial les dépôts, consignations, services de la Légion d''honneur et caisses de retraite, et pose le principe d''un placement sous la surveillance et la garantie de l''autorité législative.**

Article 110 : confie à un « établissement spécial » les dépôts, consignations, services de la Légion d''honneur et caisses de retraite. Pose le principe de placement « sous la surveillance et la garantie de l''autorité législative ».'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que prévoit la loi LME de 2008 ?',
      '**La loi LME de 2008 modernise la gouvernance de la Caisse des Dépôts, redéfinit ses missions entre intérêt général et activités concurrentielles, renforce la Commission de surveillance et la soumet à la supervision prudentielle de l''ACPR comme une banque.**

Modernise la gouvernance, redéfinit les missions (intérêt général + activités concurrentielles), renforce la Commission de surveillance, soumet la CDC à la supervision prudentielle de l''ACPR comme une banque.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que prévoit la loi PACTE de 2019 ?',
      '**La loi PACTE de 2019 crée un grand pôle financier public en rapprochant la Caisse des Dépôts, La Poste et CNP Assurances, fait de la CDC l''actionnaire majoritaire de La Poste à hauteur de 66% et renforce son rôle d''investisseur de long terme.**

Crée le grand pôle financier public en rapprochant CDC, La Poste et CNP Assurances. La CDC devient actionnaire majoritaire de La Poste (66%). Renforce le rôle d''investisseur de long terme.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Statut juridique de la CDC ?',
      '**La Caisse des Dépôts est un établissement public spécial sui generis, placé sous la surveillance et la garantie du Parlement en application de l''article L518-2 du Code monétaire et financier.**

Établissement public spécial *sui generis*, placé sous la surveillance et la garantie du Parlement (article L518-2 du Code monétaire et financier).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Qui dirige la CDC en 2026 ?',
      '**La Caisse des Dépôts est dirigée par Olivier Sichel, nommé directeur général par décret du 12 juin 2025 après l''intérim consécutif au départ d''Éric Lombard devenu ministre de l''Économie.**

Olivier Sichel, nommé directeur général par décret du 12 juin 2025, après l''intérim suite au départ d''Éric Lombard devenu ministre de l''Économie.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Qui contrôle la CDC ?',
      '**La Caisse des Dépôts est contrôlée par la Commission de surveillance, présidée par un parlementaire et composée de 16 membres parlementaires, personnalités qualifiées et représentants du personnel et de l''État, qui approuve comptes, budget, stratégie et opérations majeures.**

La Commission de surveillance, présidée par un parlementaire. 16 membres : parlementaires, personnalités qualifiées, représentants du personnel et de l''État. Approuve comptes, budget, stratégie, opérations majeures.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Article du Code monétaire et financier qui définit la CDC ?',
      '**La Caisse des Dépôts est définie par les articles L518-1 à L518-24-1 du Code monétaire et financier, l''article L518-2 la qualifiant de groupe public au service de l''intérêt général et du développement économique du pays.**

Articles L518-1 à L518-24-1 du CMF. L''article L518-2 définit la CDC comme un « groupe public au service de l''intérêt général et du développement économique du pays ».'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quels sont les 3 objectifs stratégiques du Groupe CDC ?',
      '**Les trois objectifs stratégiques du Groupe sont la transformation écologique, le renforcement des souverainetés énergétique, industrielle, numérique, économique et financière, et la cohésion sociale et territoriale.**

La transformation écologique, les souverainetés (énergétique, industrielle, numérique, économique, financière) et la cohésion sociale et territoriale.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quelle est la mission « historique » fondatrice ?',
      '**La mission historique fondatrice de la Caisse des Dépôts est celle des consignations, qui consiste à recevoir, conserver et restituer en toute neutralité des fonds privés faisant l''objet d''un litige ou d''une obligation légale, et qui correspond au C de CDC.**

Les **consignations** : recevoir, conserver et restituer des fonds privés faisant l''objet d''un litige ou d''une obligation légale, en toute neutralité. C''est le « C » de CDC.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quelles sont les grandes missions d''intérêt général ?',
      '**Les grandes missions d''intérêt général incluent la gestion des fonds d''épargne réglementée Livret A et LDDS, le financement du logement social, la gestion des retraites pour un retraité sur cinq, les dépôts juridiques des notaires et greffiers, les consignations et le financement des territoires.**

Gestion des fonds d''épargne réglementée (Livret A, LDDS), financement du logement social, gestion des retraites (1 retraité sur 5), dépôts juridiques (notaires, greffiers), consignations, financement des territoires.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Qu''est-ce que le rôle « contracyclique » ?',
      '**Le rôle contracyclique consiste à investir et prêter quand le marché privé se retire en période de crise ou de hausse des taux, afin de soutenir l''économie sur le long terme, comme on l''a vu très clairement dans le logement en 2023 et 2024.**

Investir et prêter quand le marché privé se retire (crises, hausse des taux), pour soutenir l''économie sur le long terme. Très visible dans le logement en 2023-2024.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que signifie « investisseur de long terme » ?',
      '**Investir avec un horizon de dix à trente ans au service de l''intérêt général, sans rechercher la rentabilité de court terme, ce qui distingue la Caisse des Dépôts des acteurs financiers privés.**

Investir avec un horizon de 10 à 30 ans, au service de l''intérêt général, sans rechercher la rentabilité court-terme, ce qui distingue la CDC des acteurs financiers privés.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '« Raison d''être » de la CDC ?',
      '**La raison d''être du Groupe est qu''alliance unique d''acteurs économiques publics et privés, il s''engage au cœur des territoires pour accélérer la transformation écologique et contribuer à offrir une vie meilleure pour toutes et tous.**

« Alliance unique d''acteurs économiques publics et privés, le groupe Caisse des Dépôts s''engage, au cœur des territoires, pour accélérer la transformation écologique et contribuer à offrir une vie meilleure pour toutes et tous. »'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Démarche « Grandissons ensemble » ?',
      '**Grandissons ensemble est la démarche managériale interne à la Caisse des Dépôts qui vise à renforcer la culture managériale commune, le développement des compétences et la cohésion du Groupe.**

Démarche managériale interne à la CDC visant à renforcer la culture managériale commune, le développement des compétences et la cohésion du groupe.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'NEXT et CDSCOPE ?',
      '**NEXT est l''intranet du Groupe et CDSCOPE est la revue qui diffuse l''actualité stratégique et les enjeux portés par la direction générale, deux outils à consulter régulièrement avant l''oral.**

NEXT = intranet du groupe. CDSCOPE = revue qui diffuse l''actualité stratégique et les enjeux portés par la direction générale. Outils à consulter régulièrement avant l''oral.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Banque des Territoires ?',
      '**La Banque des Territoires est la direction de la Caisse des Dépôts créée en 2018 qui regroupe prêt, investissement, conseil avec la SCET et logement avec CDC Habitat au service des collectivités, des organismes de logement social et des professions juridiques, dirigée par Olivier Sichel.**

Direction de la CDC créée en 2018 qui regroupe prêt, investissement, conseil (SCET) et logement (CDC Habitat) au service des collectivités, organismes de logement social et professions juridiques. Dirigée par Olivier Sichel.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principales filiales et participations ?',
      '**Les principales filiales et participations sont La Poste à 66%, Bpifrance à 50%, CDC Habitat, Transdev à 34%, Icade à 39%, CNP Assurances, RTE à 30%, la Compagnie des Alpes à 40%, ainsi que la SCET, Egis et EMEIS ex-Korian.**

La Poste (66%), Bpifrance (50%), CDC Habitat, Transdev (34%), Icade (39%), CNP Assurances, RTE (30%), Compagnie des Alpes (40%), SCET, Egis, EMEIS (ex-Korian).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Cinq métiers du Groupe CDC ?',
      '**Les cinq métiers du Groupe sont la Banque des Territoires, les Politiques sociales couvrant retraites, formation, handicap, grand âge et santé, la Gestion d''actifs, le suivi des filiales et participations, et Bpifrance pour le financement des entreprises.**

(1) Banque des Territoires, (2) Politiques sociales (retraites, formation, handicap, grand âge, santé), (3) Gestion d''actifs, (4) Suivi des filiales et participations, (5) Bpifrance / financement des entreprises.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Différence CDC / Bpifrance / BPCE ?',
      '**La Caisse des Dépôts est un établissement public et un investisseur de long terme, Bpifrance est la banque publique d''investissement filiale à parité de la CDC et de l''État qui finance les entreprises, et BPCE est un groupe bancaire mutualiste privé sans aucun lien capitalistique avec la CDC.**

CDC = établissement public, investisseur long terme. Bpifrance = banque publique d''investissement, filiale CDC + État (50/50), finance les entreprises. BPCE = groupe bancaire mutualiste privé, aucun lien capitalistique avec la CDC.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Combien de collaborateurs dans le Groupe ?',
      '**Le Groupe Caisse des Dépôts compte plus de 120 000 collaborateurs entre l''établissement public et ses filiales, dont environ 6 500 au sein de l''établissement public lui-même.**

Plus de 120 000 collaborateurs (établissement public + filiales), dont environ 6 500 au sein de l''établissement public.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mécanisme du Livret A et lien CDC ?',
      '**Le taux du Livret A est fixé par l''État à 1,7% au 1er février 2025 et 60% des encours sont centralisés à la Caisse des Dépôts qui les transforme en prêts longs au logement social, avec une marge fonds d''épargne d''environ Livret A plus 0,46%.**

Taux fixé par l''État (1,7% au 1er février 2025). Centralisation à 60% à la CDC qui les transforme en prêts longs au logement social. Marge fonds d''épargne ≈ Livret A + 0,46%.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Versement à l''État ?',
      '**Une partie du résultat de la Caisse des Dépôts est reversée chaque année à l''État, le reste étant réinvesti dans les missions d''intérêt général, mécanisme structurel en place depuis 1816.**

Une partie du résultat de la CDC est reversée à l''État chaque année, le reste est réinvesti dans les missions d''intérêt général. Mécanisme structurel depuis 1816.'
    );

    -- Stack 2: Plans stratégiques, axes, mesures phares, chiffres
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 02. Plans stratégiques, axes, mesures phares, chiffres',
      '13 cartes sur le plan Groupe 100 Md€, le plan BDT 2024-2028 (90 Md€, 16 mesures), le bilan logement record et les programmes territoriaux emblématiques.',
      '__starter:cdc-attache-v4__:stack-02',
      13,
      13,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Engagement financier transformation écologique 2024-2028 ?',
      '**Le Groupe Caisse des Dépôts s''engage à mobiliser 100 milliards d''euros sur 2024-2028 pour accélérer la transformation écologique du pays, succédant au plan 60 milliards d''euros 2020-2024 qui avait déjà été dépassé dès 2023.**

100 milliards d''euros pour accélérer la transformation écologique du pays. Succède au plan 60 Md€ (2020-2024), dépassé dès 2023.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Avancement de cet objectif ?',
      '**Près de 40 milliards d''euros ont déjà été mobilisés en 18 mois entre janvier 2024 et juin 2025, et la trajectoire pourrait atteindre 130 milliards d''euros d''ici 2028, dépassant la cible initiale.**

Près de 40 Md€ déjà mobilisés en 18 mois (janvier 2024 - juin 2025). Pourrait atteindre 130 Md€ d''ici 2028, dépassant la cible.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Secteurs prioritaires de ce plan ?',
      '**Les deux secteurs prioritaires du plan 100 milliards d''euros sont le logement et le transport, dans le cadre de la feuille de route France Nation Verte.**

Logement et transport en priorité, dans le cadre de la feuille de route France Nation Verte.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Objectif climat de la CDC ?',
      '**La Caisse des Dépôts vise une réduction de 55% de l''empreinte carbone de ses portefeuilles d''actions cotées et d''obligations d''entreprises entre 2020 et 2030, sur les scopes 1 et 2.**

Réduction de 55% de l''empreinte carbone des portefeuilles d''actions cotées et obligations d''entreprises entre 2020 et 2030 (scopes 1 et 2).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Plan stratégique BDT 2024-2028 ?',
      '**Le plan de la Banque des Territoires 2024-2028 mobilise 90 milliards d''euros sur cinq ans déployés à travers 16 mesures phares, pour passer de la transition à la transformation effective des territoires plus verts et plus solidaires.**

90 Md€ sur 5 ans, déployés à travers 16 mesures phares pour passer de la transition à la transformation effective des territoires. Slogan : « des territoires plus verts et plus solidaires ».'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Les 8 mesures « territoires plus verts » ?',
      '**Les huit mesures vertes regroupent 1,2 milliard pour l''adaptation climatique, 16,8 milliards pour la réhabilitation du parc public, 1,5 milliard pour le mix énergétique décarboné, 1,3 milliard pour la mobilité décarbonée, 1,8 milliard pour la ressource en eau, 180 millions pour la transition alimentaire, 350 millions pour les déchets et 900 millions pour la sobriété foncière.**

1,2 Md€ adaptation climatique • 16,8 Md€ réhabilitation parc public • 1,5 Md€ mix énergétique décarboné • 1,3 Md€ mobilité décarbonée • 1,8 Md€ ressource en eau • 180 M€ transition alimentaire • 350 M€ déchets • 900 M€ sobriété foncière.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Les 8 mesures « cohésion sociale » ?',
      '**Les huit mesures de cohésion sociale comprennent 240 millions pour France Services, la lutte contre les déserts médicaux, 3,8 milliards pour l''accès au droit numérique, 56,5 milliards pour le logement social et abordable, 2,1 milliards pour le développement économique local, 900 millions pour la réindustrialisation, 3,3 milliards pour l''habitat seniors et 400 millions pour la donnée publique souveraine.**

240 M€ France Services • lutte déserts médicaux • 3,8 Md€ accès au droit numérique • 56,5 Md€ logement social et abordable • 2,1 Md€ développement économique local • 900 M€ réindustrialisation • 3,3 Md€ habitat seniors • 400 M€ donnée publique souveraine.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Part du logement dans le plan BDT ?',
      '**Le logement représente plus de 80% du plan Banque des Territoires, avec 56,5 milliards pour le logement social et 16,8 milliards pour la réhabilitation du parc public, soit 73,3 milliards d''euros au total.**

Plus de 80% : 56,5 Md€ logement social + 16,8 Md€ réhabilitation parc public = 73,3 Md€.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Bilan logement BDT 2024 (record) ?',
      '**La Banque des Territoires a accordé 28,5 milliards d''euros de prêts en 2024, en hausse de 74% par rapport à 2023, dont 20,9 milliards pour le logement social et 7,6 milliards pour le secteur public local, ce qui a permis de financer 115 000 logements abordables soit plus de 40% de la production neuve française.**

28,5 Md€ de prêts (+74% vs 2023). 20,9 Md€ logement social, 7,6 Md€ secteur public local. **115 000 logements abordables financés, soit plus de 40% de la production neuve française**.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Logement intermédiaire 2024 ?',
      '**Le logement intermédiaire a bénéficié de 4,5 milliards d''euros de prêts en 2024 contre 600 millions en 2023, pour 30 000 logements, en soutien à Action Logement et CDC Habitat, illustration concrète du rôle contracyclique du Groupe.**

4,5 Md€ de prêts (vs 600 M€ en 2023), pour 30 000 logements. Soutien à Action Logement et CDC Habitat. Illustration concrète du rôle contracyclique.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Capillarité territoriale BDT ?',
      '**La Banque des Territoires a accompagné 8 547 communes entre 2019 et 2024, soit 25% des communes françaises, en s''appuyant sur 16 directions régionales et 37 implantations locales.**

8 547 communes accompagnées entre 2019 et 2024, soit 25% des communes françaises. 16 directions régionales, 37 implantations locales.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Programmes territoriaux emblématiques ?',
      '**Les programmes territoriaux emblématiques sont Action Cœur de Ville pour 234 villes moyennes, Petites Villes de Demain pour 1 600 communes, Territoires d''Industrie, France Services avec environ 2 800 maisons, et Quartiers 2030 pour 1 300 quartiers prioritaires en partenariat avec Bpifrance.**

**Action Cœur de Ville** (234 villes moyennes), **Petites Villes de Demain** (1 600 communes), **Territoires d''Industrie**, **France Services** (~2 800 maisons), **Quartiers 2030** (1 300 QPV avec Bpifrance).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Plan Climat de Bpifrance ?',
      '**Le Plan Climat de Bpifrance a engagé 4,2 milliards d''euros sur 2020-2024 pour l''innovation greentech et la transition des entreprises, avec notamment le programme Diag Décarbon''Action destiné aux PME et ETI.**

4,2 Md€ engagés 2020-2024. Innovation greentech, transition des entreprises. Programme « Diag Décarbon''Action » pour PME et ETI.'
    );

    -- Stack 3: La CDC face aux grands défis (IA, santé, retraites, climat)
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 03. La CDC face aux grands défis (IA, santé, retraites, climat)',
      '20 cartes sur Horizon Numérique 2030, Mistral AI, IA Factory, Campus IA, la feuille de route santé/grand âge, la transition écologique et les sujets transverses.',
      '__starter:cdc-attache-v4__:stack-03',
      20,
      20,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Plan Horizon Numérique 2030 ?',
      '**Le plan Horizon Numérique 2030 présenté le 26 février 2026 mobilise 18 milliards d''euros sur 2026-2030, dont 12 milliards de subventions et 6 milliards d''investissements, pour la souveraineté numérique européenne, avec un effet de levier estimé à 26 milliards d''euros.**

Présenté le 26 février 2026. 18 Md€ sur 2026-2030 (12 Md€ subventions, 6 Md€ investissements) pour la souveraineté numérique européenne. Effet de levier estimé à 26 Md€.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Deux axes du plan Horizon Numérique 2030 ?',
      '**Le premier axe vise à structurer un écosystème numérique européen plus autonome, financer des start-ups tech et démocratiser l''IA auprès de 10 000 PME, et le second axe poursuit la transformation digitale interne du Groupe.**

(1) Structurer un écosystème numérique européen plus autonome, financer des start-ups tech, démocratiser l''IA auprès de 10 000 PME ; (2) Poursuivre la transformation digitale interne du groupe.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Partenariat CDC × Mistral AI ?',
      '**La Caisse des Dépôts a signé un accord avec Mistral AI pour déployer des outils d''IA générative et acquérir des capacités de calcul en GPU, en regroupant 19 filiales du Groupe en achat mutualisé, avec 40 000 licences IA en phase initiale et jusqu''à 100 000 utilisateurs visés.**

Accord pour déployer des outils d''IA générative et acquérir des capacités de calcul (GPU). 19 filiales du groupe regroupées en achat mutualisé. 40 000 licences IA en phase initiale, jusqu''à 100 000 utilisateurs.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'IA Factory ?',
      '**L''IA Factory est l''accélérateur interne du Groupe Caisse des Dépôts qui industrialise les usages de l''IA au bénéfice du Groupe, des acteurs publics et des territoires, en garantissant souveraineté, conformité et performance.**

Accélérateur interne pour industrialiser les usages de l''IA, au bénéfice du groupe et des acteurs publics et territoires. Garantit souveraineté, conformité et performance.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Campus IA ?',
      '**Le Campus IA est le premier campus européen dédié aux infrastructures de calcul IA, porté par MGX, Bpifrance, Mistral AI et Nvidia, avec une capacité de 240 mégawatts d''ici fin 2027 et jusqu''à 1 400 mégawatts à terme via RTE.**

Premier campus européen dédié aux infrastructures de calcul IA. Porté par MGX, Bpifrance, Mistral AI et Nvidia. 240 MW d''ici fin 2027, jusqu''à 1 400 MW à terme via RTE.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Accord Sopra Steria + Computacenter ?',
      '**La Caisse des Dépôts a conclu un accord-cadre stratégique avec Sopra Steria et Computacenter pour déployer des solutions d''IA générative et agentique, d''une durée maximale de 4 ans pour un montant pouvant atteindre 140 millions d''euros.**

Accord-cadre stratégique pour déployer des solutions d''IA générative et agentique. Durée maximale 4 ans, jusqu''à 140 M€.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '« Cloud au centre de l''État » ?',
      '**La doctrine Cloud au centre fixe les données éligibles au cloud souverain via la certification SecNumCloud, et la Caisse des Dépôts en tant que tiers de confiance déploie ses outils d''IA sur cette base.**

Doctrine fixant les données éligibles au cloud souverain (certification SecNumCloud). La CDC, tiers de confiance, déploie ses outils IA sur cette base.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Feuille de route Santé et Grand Âge ?',
      '**La feuille de route Santé et Grand Âge mobilise 25 milliards d''euros sur cinq ans à horizon 2030, dont 6 milliards déjà mobilisés en 2025.**

25 Md€ sur 5 ans à horizon 2030. En 2025, 6 Md€ déjà mobilisés.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Détail des 6 Md€ mobilisés en 2025 ?',
      '**Les 6 milliards mobilisés en 2025 se décomposent en 3,6 milliards de prêts dont 2,6 milliards pour 250 structures sanitaires et 1 milliard pour 200 structures médico-sociales, plus 2,2 milliards d''investissements directs et innovation, dont 52% sont fléchés vers les secteurs public et associatif.**

3,6 Md€ de prêts (2,6 Md€ pour 250 structures sanitaires, 1 Md€ pour 200 structures médico-sociales) + 2,2 Md€ d''investissements directs et innovation. 52% pour secteurs public et associatif.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Filiales CDC mobilisées sur la santé ?',
      '**Les filiales mobilisées sur la santé sont la Banque des Territoires, Bpifrance, La Poste, CNP Assurances, CDC Habitat, SFIL et EMEIS ex-Korian, avec Icade Santé sur l''immobilier sanitaire.**

Banque des Territoires, Bpifrance, La Poste, CNP Assurances, CDC Habitat, SFIL, EMEIS (ex-Korian). Icade Santé sur l''immobilier sanitaire.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Arpavie ?',
      '**Arpavie est le premier groupe associatif français gestionnaire d''établissements pour personnes âgées avec 130 établissements, fondé par la Caisse des Dépôts avec Action Logement, et en cours de rapprochement avec le Groupe SOS Seniors en 2025.**

1er groupe associatif français gestionnaire d''établissements pour personnes âgées (130 établissements), fondé par la CDC avec Action Logement. Rapprochement avec Groupe SOS Seniors en 2025.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Réponse de la CDC aux déserts médicaux ?',
      '**Via la Banque des Territoires, la Caisse des Dépôts soutient les maisons de santé pluriprofessionnelles, les centres de santé, la télémédecine, les plateformes gérontologiques et la santé connectée pour lutter contre les déserts médicaux.**

Via la BDT : maisons de santé pluriprofessionnelles (MSP), centres de santé, télémédecine, plateformes gérontologiques, soutien à la santé connectée.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mobilité verte mobilisée 2024-2025 ?',
      '**Près de 6 milliards d''euros ont été mobilisés sur la mobilité verte entre janvier 2024 et juin 2025.**

Près de 6 Md€ entre janvier 2024 et juin 2025.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Eau et biodiversité 2024-2025 ?',
      '**2,5 milliards d''euros ont été mobilisés sur 2024-2025 pour la gestion de l''eau, la renaturation des friches industrielles et la sobriété foncière.**

2,5 Md€ pour la gestion de l''eau, la renaturation des friches industrielles, la sobriété foncière.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'CDC Biodiversité ?',
      '**CDC Biodiversité est la filiale créée en 2008 dédiée à la compensation écologique via les projets territoriaux de biodiversité, à la restauration et au financement de la biodiversité.**

Filiale créée en 2008 pour la compensation écologique (PTB — projets territoriaux de biodiversité), restauration et financement de la biodiversité.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Lien CDC × ODD ?',
      '**La Caisse des Dépôts a intégré 8 ODD prioritaires sur les 17 dans son pilotage stratégique depuis 2019, avec plus de 40 cibles quantitatives.**

La CDC a intégré 8 ODD prioritaires (sur 17) depuis 2019 dans son pilotage stratégique, avec 40+ cibles quantitatives.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Année emblématique 2025-2026 ?',
      '**L''année 2025-2026 est l''année des diversités à la Caisse des Dépôts, mentionnée dans le rapport jury Principalat 2025 comme question posée, et couvrant l''égalité femmes-hommes, le handicap, les origines sociales, l''intergénérationnel et les LGBT+.**

**L''année des diversités** (mentionnée dans le rapport jury Principalat 2025 comme question posée). Égalité F/H, handicap, origines sociales, intergénérationnel, LGBT+.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Rôle CDC dans la formation professionnelle ?',
      '**La Caisse des Dépôts gère le Compte Personnel de Formation et l''application Mon Compte Formation, qui compte 38 millions de comptes actifs et plus d''un million de formations financées chaque année.**

Gère le Compte Personnel de Formation (CPF) et l''application **Mon Compte Formation**. 38 millions de comptes actifs, plus d''1 million de formations financées par an.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Combien de retraités gérés par la CDC ?',
      '**La Caisse des Dépôts gère un retraité sur cinq en France, soit plus de 7 millions de retraités au total, à travers 66 fonds et mandats pour 55 000 employeurs publics.**

1 retraité sur 5 en France, plus de 7 millions au total. 66 fonds et mandats, 55 000 employeurs publics.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Régimes gérés par la CDC ?',
      '**La Caisse des Dépôts gère la CNRACL pour la fonction publique territoriale et hospitalière, l''Ircantec pour les contractuels publics, le FSPOEIE, la RAFP, le régime des Mines et la retraite de la Banque de France.**

CNRACL (territoriale + hospitalière), Ircantec (contractuels publics), FSPOEIE, RAFP, régime des Mines, retraite Banque de France.'
    );

    -- Stack 4: Vie administrative et institutionnelle
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 04. Vie administrative et institutionnelle',
      '20 cartes sur les versants de la fonction publique, le CIGEM des attachés, le statut, la déontologie, les collectivités, la LOLF, la haute FP et le plan DGAFP 2030.',
      '__starter:cdc-attache-v4__:stack-04',
      20,
      20,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Versants de la fonction publique ?',
      '**Les trois versants de la fonction publique sont la fonction publique d''État (FPE), la fonction publique territoriale (FPT) et la fonction publique hospitalière (FPH), qui rassemblent au total environ 5,7 millions d''agents.**

FPE (État), FPT (territoriale), FPH (hospitalière). Environ 5,7 millions d''agents au total.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Catégories hiérarchiques ?',
      '**Les trois catégories hiérarchiques sont la catégorie A pour la conception, l''encadrement et l''expertise, la catégorie B pour l''application et l''encadrement intermédiaire, et la catégorie C pour l''exécution, l''attaché relevant de la catégorie A.**

A (conception, encadrement, expertise), B (application, encadrement intermédiaire), C (exécution). L''attaché est en catégorie A.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'CIGEM des attachés ?',
      '**Le CIGEM est le Corps interministériel à gestion ministérielle des attachés d''administration de l''État, créé en 2011, qui regroupe les attachés des différents ministères et établissements publics et permet la mobilité entre administrations.**

Corps interministériel des attachés d''administration de l''État, créé en 2011. Regroupe les attachés des différents ministères et établissements publics. Permet la mobilité entre administrations.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Grades du corps des attachés ?',
      '**Le corps des attachés comporte trois grades : attaché, attaché principal et attaché hors classe, avec une promotion possible au choix ou par examen professionnel.**

Attaché, attaché principal, attaché hors classe. Promotion au choix ou par examen professionnel.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Texte qui régit le statut de la fonction publique ?',
      '**Le statut de la fonction publique est régi par le Code général de la fonction publique entré en vigueur le 1er mars 2022, qui codifie l''ancienne loi Le Pors de 1983 et les lois statutaires suivantes.**

Code général de la fonction publique (CGFP), entré en vigueur le 1er mars 2022. Codifie l''ancienne loi Le Pors de 1983 et les lois suivantes.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principes du statut de la fonction publique ?',
      '**Les principes du statut sont l''égalité d''accès, l''indépendance vis-à-vis du politique, la responsabilité, la séparation du grade et de l''emploi et le principe de carrière.**

Égalité d''accès, indépendance vis-à-vis du politique, responsabilité, séparation du grade et de l''emploi, principe de carrière.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principaux devoirs du fonctionnaire ?',
      '**Les principaux devoirs du fonctionnaire sont l''obéissance hiérarchique sauf ordre manifestement illégal, la neutralité, la laïcité, la discrétion professionnelle, le secret professionnel, la dignité, la probité, l''impartialité et le devoir de réserve.**

Obéissance hiérarchique (sauf ordre manifestement illégal), neutralité, laïcité, discrétion professionnelle, secret professionnel, dignité, probité, impartialité, devoir de réserve.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Déontologie du fonctionnaire ?',
      '**La déontologie du fonctionnaire est encadrée par la loi du 20 avril 2016 et inclut la prévention des conflits d''intérêts, la déclaration d''intérêts pour certains postes, ainsi que le rôle de la HATVP et du référent déontologue.**

Encadrée par la loi du 20 avril 2016. Inclut prévention des conflits d''intérêts, déclaration d''intérêts pour certains postes, rôle de la HATVP et du référent déontologue.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'HATVP ?',
      '**La HATVP est la Haute Autorité pour la Transparence de la Vie Publique qui contrôle les déclarations d''intérêts et de patrimoine des responsables publics et prévient les conflits d''intérêts.**

Haute Autorité pour la Transparence de la Vie Publique. Contrôle les déclarations d''intérêts et de patrimoine des responsables publics, prévient les conflits d''intérêts.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Déconcentration vs décentralisation ?',
      '**La déconcentration est le transfert de pouvoir au sein de l''État vers les préfets et services déconcentrés, tandis que la décentralisation est le transfert de compétences à des collectivités territoriales autonomes comme les communes, départements et régions.**

Déconcentration = transfert de pouvoir au sein de l''État (préfets, services déconcentrés). Décentralisation = transfert à des collectivités territoriales autonomes (communes, départements, régions).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      '3 niveaux de collectivités territoriales ?',
      '**Les trois niveaux de collectivités territoriales sont les communes (environ 35 000), les départements (101) et les régions (18), auxquels s''ajoutent les EPCI (intercommunalités) et les collectivités à statut particulier comme la Corse, l''outre-mer et Paris-Lyon-Marseille.**

Communes (~35 000), départements (101), régions (18). Plus EPCI (intercommunalités) et collectivités à statut particulier (Corse, outre-mer, Paris-Lyon-Marseille).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'LOLF ?',
      '**La LOLF est la Loi organique relative aux lois de finances de 2001 qui organise le budget de l''État en missions, programmes et actions, avec une logique de performance et d''évaluation.**

Loi organique relative aux lois de finances (2001). Organise le budget de l''État en missions / programmes / actions, avec une logique de performance et d''évaluation.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'EPIC, EPA, EPCI ?',
      '**Un EPIC est un établissement public industriel et commercial comme la SNCF, un EPA est un établissement public administratif comme les universités, et un EPCI est un établissement public de coopération intercommunale comme les communautés de communes ou les métropoles.**

EPIC = établissement public industriel et commercial (SNCF). EPA = établissement public administratif (universités). EPCI = établissement public de coopération intercommunale (communautés de communes, métropoles).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Réforme de la haute fonction publique ?',
      '**La réforme de la haute fonction publique a supprimé l''ENA en 2022, créé l''Institut National du Service Public et le corps des administrateurs de l''État, instauré une mobilité obligatoire et renforcé la formation continue.**

Suppression de l''ENA en 2022, création de l''INSP (Institut National du Service Public), création du corps des administrateurs de l''État, mobilité obligatoire, formation continue renforcée.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principes de l''action publique ?',
      '**Les principes de l''action publique sont la continuité, l''égalité, la mutabilité, la neutralité, la laïcité, la gratuité pour certains services, la transparence et la probité.**

Continuité, égalité, mutabilité (adaptabilité), neutralité, laïcité, gratuité (pour certains services), transparence, probité.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Projet « DGAFP 2030 — Partenaire des services publics » ?',
      '**DGAFP 2030 est le projet stratégique finalisé en janvier 2026 qui confirme le double rôle de la DGAFP : pilote des politiques RH des trois versants et DRH de l''État au service de 5,8 millions d''agents publics.**

Projet stratégique finalisé en janvier 2026. Double rôle : pilote des politiques RH des 3 versants ET DRH de l''État au service de 5,8 millions d''agents publics.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Enjeux qui motivent DGAFP 2030 ?',
      '**Les enjeux qui motivent DGAFP 2030 sont le vieillissement démographique, les tensions de recrutement, l''attractivité, l''intelligence artificielle et les exigences accrues des usagers.**

Vieillissement démographique, tensions de recrutement, attractivité, intelligence artificielle, exigences accrues des usagers.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Axe attractivité de DGAFP 2030 ?',
      '**L''axe attractivité de DGAFP 2030 promeut une fonction publique exemplaire, plus attractive, plus inclusive et mieux connue des citoyens, avec une attention particulière aux conditions de travail, au management et à l''égalité professionnelle.**

Promouvoir une fonction publique exemplaire, plus attractive, plus inclusive et mieux connue des citoyens, avec une attention aux conditions de travail, au management et à l''égalité professionnelle.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Revue stratégique de la fonction publique 2035-2050 ?',
      '**La revue stratégique 2035-2050 est un exercice prospectif lancé le 6 octobre 2025 pour le 80e anniversaire de la DGAFP, dont les conclusions sont attendues en octobre 2026 sur le thème central « Unicité et diversité » de la fonction publique.**

Exercice prospectif lancé le 6 octobre 2025 (80e anniversaire DGAFP). Conclusions attendues octobre 2026. Thème central : « Unicité et diversité » de la fonction publique.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Leviers d''attractivité mobilisés ?',
      '**Les leviers d''attractivité mobilisés sont l''apprentissage avec un objectif de 23 000 apprentis 2025-2026 dans la FPE, la protection sociale complémentaire, le télétravail, la qualité de vie au travail, la marque employeur, la mobilité et la formation continue.**

Apprentissage (objectif 23 000 apprentis 2025-2026 dans la FPE), protection sociale complémentaire, télétravail, qualité de vie au travail, marque employeur, mobilité, formation continue.'
    );

    -- Stack 5: Posture de cadre A et management
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 05. Posture de cadre A et management',
      '7 cartes sur la posture cadre A : management bienveillant et exigeant, gestion de conflit, conduite du changement, CODIR et management fonctionnel.',
      '__starter:cdc-attache-v4__:stack-05',
      7,
      7,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Qu''est-ce qui caractérise un cadre A ?',
      '**Un cadre A se caractérise par sa capacité à concevoir, piloter, décider, encadrer, représenter l''institution, prendre du recul stratégique, arbitrer et rendre compte, dans une posture d''autonomie et de responsabilité.**

Capacité à concevoir, piloter, décider, encadrer, représenter l''institution, prendre du recul stratégique, arbitrer, rendre compte. Posture d''autonomie et de responsabilité.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Management bienveillant et exigeant ?',
      '**Le management bienveillant et exigeant combine écoute, reconnaissance et soutien des équipes avec clarté des objectifs, fermeté sur les résultats et capacité à arbitrer, étant entendu que la bienveillance n''est pas la complaisance.**

Combine écoute, reconnaissance et soutien des équipes avec clarté des objectifs, fermeté sur les résultats et capacité à arbitrer. Bienveillance ≠ complaisance.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Réagir face à un conflit dans une équipe ?',
      '**Face à un conflit, le manager ne doit pas éviter mais recevoir chaque partie séparément, objectiver les faits, identifier la cause réelle, proposer une médiation, recadrer si besoin, formaliser une solution, tracer et suivre dans le temps, en mobilisant pairs et hiérarchie.**

Ne pas éviter, recevoir chaque partie séparément, objectiver les faits, identifier la cause réelle, proposer une médiation, recadrer si besoin, formaliser une solution, tracer, suivre dans le temps.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Gérer un collaborateur en difficulté ?',
      '**Pour gérer un collaborateur en difficulté, il faut identifier la cause qu''elle soit de compétence, de motivation ou personnelle, organiser un échange en face à face, fixer des objectifs clairs avec accompagnement, mobiliser RH ou formation si besoin et suivre régulièrement.**

Identifier la cause (compétence, motivation, personnel), poser un échange en face-à-face, fixer des objectifs clairs avec accompagnement, mobiliser RH/formation si besoin, suivre régulièrement.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Conduite du changement ?',
      '**La conduite du changement repose sur un diagnostic partagé, une vision claire, une communication transparente, l''association des équipes, la formation, le pilotage des résistances, des étapes lisibles et l''évaluation.**

Diagnostic partagé, vision claire, communication transparente, association des équipes, formation, pilotage des résistances, étapes lisibles, évaluation.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'CODIR ?',
      '**Le CODIR est le comité de direction, instance de pilotage stratégique réunissant les responsables d''une entité, et une intervention en CODIR doit être structurée autour des enjeux, des options, d''une recommandation et de la décision attendue.**

Comité de direction. Instance de pilotage stratégique réunissant les responsables d''une entité. Une intervention en CODIR doit être structurée : enjeux, options, recommandation, décision attendue.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Management fonctionnel (sans lien hiérarchique) ?',
      '**Le management fonctionnel sans lien hiérarchique repose sur la légitimité par la compétence et la qualité du dialogue, la clarté des objectifs et livrables, le sens donné à l''action, la remontée d''information à la hiérarchie et l''animation collective : pas de pouvoir formel mais de l''influence.**

Légitimité par la compétence et la qualité du dialogue, clarté des objectifs et livrables, sens donné à l''action, remontée d''information à la hiérarchie, animation collective. Pas de pouvoir formel mais influence.'
    );

    -- Stack 6: Actualité gouvernementale et institutionnelle
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 06. Actualité gouvernementale et institutionnelle',
      '11 cartes sur le gouvernement Lecornu II, France 2030, la planification écologique, le Pacte vert européen, l''IA Act, la CSRD et le ZAN.',
      '__starter:cdc-attache-v4__:stack-06',
      11,
      11,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Président de la République et Premier ministre ?',
      '**Emmanuel Macron est Président de la République depuis son deuxième mandat en 2022, et Sébastien Lecornu est Premier ministre, reconduit le 10 octobre 2025 après la chute du gouvernement Bayrou, avec un remaniement marginal le 26 février 2026.**

Emmanuel Macron (2e mandat depuis 2022). Sébastien Lecornu, Premier ministre, reconduit le 10 octobre 2025 après la chute du gouvernement Bayrou. Remaniement marginal le 26 février 2026.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Ministre de l''Économie en 2026 ?',
      '**Roland Lescure est ministre de l''Économie, des Finances et de la Souveraineté industrielle, énergétique et numérique depuis février 2026, après le départ d''Éric Lombard.**

Roland Lescure, ministre de l''Économie, des Finances et de la Souveraineté industrielle, énergétique et numérique (depuis février 2026, après le départ d''Éric Lombard).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Ministre de l''Action publique ?',
      '**David Amiel est ministre de l''Action publique depuis février 2026, après la nomination d''Amélie de Montchalin à la première présidence de la Cour des comptes.**

David Amiel (depuis février 2026, après la nomination d''Amélie de Montchalin à la première présidence de la Cour des comptes).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Ministre de l''Aménagement du territoire et de la Décentralisation ?',
      '**Françoise Gatel est ministre de l''Aménagement du territoire et de la Décentralisation, et pilote notamment le projet de loi décentralisation.**

Françoise Gatel, qui pilote notamment le projet de loi décentralisation.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Grande cause nationale 2026 ?',
      '**La grande cause nationale 2026 est la santé mentale, enjeu de prévention, de prise en charge et de déstigmatisation, particulièrement chez les jeunes et au travail.**

La santé mentale. Enjeu de prévention, prise en charge, déstigmatisation, particulièrement chez les jeunes et au travail.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'France 2030 ?',
      '**France 2030 est un plan d''investissement de 54 milliards d''euros couvrant 2021-2030 pour la réindustrialisation, l''innovation et la transition écologique, piloté par le SGPI, dont la Caisse des Dépôts est un opérateur majeur.**

Plan d''investissement de 54 Md€ (2021-2030) pour la réindustrialisation, l''innovation et la transition écologique. Piloté par le SGPI. La CDC en est un opérateur majeur.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Planification écologique ?',
      '**La planification écologique est la démarche interministérielle pilotée par le Premier ministre depuis 2022 via le SGPE pour atteindre les objectifs climat de moins 55% d''émissions de gaz à effet de serre en 2030 par rapport à 1990, en déclinant les efforts par secteur et par territoire.**

Démarche interministérielle pilotée par le Premier ministre depuis 2022 (SGPE) pour atteindre les objectifs climat (-55% GES en 2030 vs 1990). Décline les efforts par secteur et territoire.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Pacte vert européen ?',
      '**Le Pacte vert européen est la stratégie de l''UE adoptée en 2019 pour la neutralité carbone en 2050, qui inclut la loi européenne sur le climat, le paquet Fit for 55, la taxonomie verte et le mécanisme d''ajustement carbone aux frontières (MACF).**

Stratégie de l''UE adoptée en 2019 pour la neutralité carbone en 2050. Inclut la loi européenne sur le climat, le paquet « Fit for 55 », la taxonomie verte, le mécanisme d''ajustement carbone aux frontières (MACF).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'IA Act européen ?',
      '**L''IA Act est le règlement européen sur l''IA adopté en 2024, qui classe les usages par niveau de risque (interdit, haut risque, limité, minimal) et constitue la première régulation mondiale de l''intelligence artificielle.**

Règlement européen sur l''IA (2024). Classe les usages par niveau de risque (interdit, haut risque, limité, minimal). Première régulation mondiale de l''IA.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Directive CSRD ?',
      '**La directive CSRD est la directive européenne de 2022 sur le reporting de durabilité, qui oblige les grandes entreprises à publier des informations détaillées sur leur impact ESG, et qui concerne aussi la Caisse des Dépôts et ses filiales.**

Directive européenne (2022) sur le reporting de durabilité. Oblige les grandes entreprises à publier des informations détaillées sur leur impact ESG. Concerne aussi la CDC et ses filiales.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'ZAN (Zéro Artificialisation Nette) ?',
      '**Le ZAN est l''objectif fixé par la loi Climat et Résilience de 2021 visant à diviser par deux le rythme d''artificialisation des sols d''ici 2031 et à atteindre zéro artificialisation nette en 2050, sujet sensible pour les collectivités.**

Objectif fixé par la loi Climat et Résilience (2021) : diviser par 2 le rythme d''artificialisation des sols d''ici 2031, zéro artificialisation nette en 2050. Sujet sensible pour les collectivités.'
    );

    -- Stack 7: Dette, budget, finances publiques
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 07. Dette, budget, finances publiques',
      '12 cartes sur la dette publique 2025, le déficit, la trajectoire budgétaire, la Cour des comptes, le 49.3, la LFI 2026 et la loi spéciale.',
      '__starter:cdc-attache-v4__:stack-07',
      12,
      12,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Niveau de la dette publique fin 2025 ?',
      '**La dette publique atteint 3 460,5 milliards d''euros fin 2025, soit 115,6% du PIB selon l''Insee en mars 2026, plaçant la France au 3e rang des dettes les plus élevées de l''UE derrière la Grèce et l''Italie.**

3 460,5 Md€, soit 115,6% du PIB (Insee, mars 2026). 3e dette la plus élevée de l''UE, derrière la Grèce et l''Italie.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Niveau du déficit public 2025 ?',
      '**Le déficit public 2025 s''établit à 5,1% du PIB soit environ 152 milliards d''euros, avec des dépenses publiques à 57,2% du PIB et des prélèvements obligatoires à 43,6% du PIB.**

5,1% du PIB, environ 152 Md€. Dépenses publiques à 57,2% du PIB, prélèvements obligatoires à 43,6% du PIB.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Trajectoire budgétaire visée ?',
      '**La trajectoire vise à ramener le déficit à 5% du PIB en 2026 puis sous le plafond européen de 3% en 2029, trajectoire jugée fragile par la Cour des comptes et la Banque de France.**

Ramener le déficit à 5% du PIB en 2026, puis sous le plafond européen de 3% en 2029. Trajectoire jugée fragile par la Cour des comptes et la Banque de France.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Charge de la dette ?',
      '**La charge de la dette s''élève à environ 58 milliards d''euros en 2024 et est devenue le 2e poste budgétaire de l''État en dépassant la Défense hors pensions, ce qui réduit la marge de manœuvre budgétaire.**

~58 Md€ en 2024, devenu le 2e poste budgétaire de l''État, dépassant la Défense (hors pensions). Réduit la marge de manœuvre budgétaire.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Agence France Trésor (AFT) ?',
      '**L''AFT est le service du ministère des Finances qui gère la dette et la trésorerie de l''État, et qui émet plus de 530 milliards d''euros de dette en 2026, niveau record.**

Service du ministère des Finances qui gère la dette et la trésorerie de l''État. Émet plus de 530 Md€ de dette en 2026 — niveau record.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Cour des comptes ?',
      '**La Cour des comptes est une juridiction financière indépendante qui contrôle les comptes publics, évalue les politiques publiques et certifie les comptes, présidée depuis février 2026 par Amélie de Montchalin.**

Juridiction financière indépendante. Contrôle les comptes publics, évalue les politiques publiques, certifie les comptes. Présidée depuis février 2026 par Amélie de Montchalin.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Règles européennes de discipline budgétaire ?',
      '**Le Pacte de stabilité et de croissance fixe un déficit inférieur à 3% du PIB et une dette inférieure à 60% du PIB, et la réforme de 2024 introduit des trajectoires pluriannuelles négociées, la France étant en procédure de déficit excessif.**

Pacte de stabilité et de croissance : déficit < 3% PIB, dette < 60% PIB. Réforme 2024 : trajectoires pluriannuelles négociées. La France est en procédure de déficit excessif.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Adoption de la loi de finances 2026 ?',
      '**La loi de finances 2026 a été adoptée via le 49.3 (article 49 alinéa 3 de la Constitution) le 19 janvier 2026 par Sébastien Lecornu, après 350 heures de débats et l''échec de la commission mixte paritaire.**

Adoption via 49.3 (article 49 alinéa 3 de la Constitution) le 19 janvier 2026 par Sébastien Lecornu, après 350 heures de débats et l''échec de la commission mixte paritaire.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principales mesures du budget 2026 ?',
      '**Les principales mesures du budget 2026 sont la hausse de la prime d''activité, une contribution exceptionnelle sur les grandes entreprises, une CSG sur les revenus financiers majorée de 1,4 point, la mise à contribution des ministères hors régalien et des économies sur Travail et Écologie.**

Hausse de la prime d''activité, contribution exceptionnelle sur grandes entreprises, CSG sur revenus financiers +1,4 point, mise à contribution des ministères hors régalien, économies sur Travail et Écologie.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Effort demandé aux collectivités ?',
      '**L''effort demandé aux collectivités a été réduit de moitié par rapport au PLF initial après négociation avec le Sénat, malgré les critiques fortes des associations d''élus comme l''AMF, l''ADF et Régions de France.**

Réduit de moitié par rapport au PLF initial après négociation avec le Sénat. Critiques fortes des associations d''élus (AMF, ADF, Régions de France).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'PLFSS ?',
      '**Le PLFSS est le projet de loi de financement de la sécurité sociale qui vote chaque année les recettes et dépenses des branches maladie, retraite, famille, AT-MP et autonomie, le PLFSS 2026 ayant été adopté le 16 décembre 2025 et intègre la suspension des retraites.**

Projet de loi de financement de la sécurité sociale. Vote annuel des recettes/dépenses des branches (maladie, retraite, famille, AT-MP, autonomie). PLFSS 2026 adopté le 16 décembre 2025, intègre la suspension des retraites.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Loi spéciale budgétaire 2025 ?',
      '**La loi spéciale budgétaire adoptée fin 2025 a permis de poursuivre la perception des impôts faute d''accord sur le budget 2026, procédure exceptionnelle qui est un signe de blocage institutionnel.**

Loi adoptée fin 2025 pour permettre la perception des impôts faute d''accord sur le budget 2026. Procédure exceptionnelle, signe de blocage institutionnel.'
    );

    -- Stack 8: Retraites, inflation, pouvoir d'achat
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 08. Retraites, inflation, pouvoir d''achat',
      '12 cartes sur la suspension de la réforme des retraites (LFSS 2026), l''inflation 2026, le prix du gaz, la CRE et la souveraineté énergétique.',
      '__starter:cdc-attache-v4__:stack-08',
      12,
      12,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Suspension de la réforme des retraites ?',
      '**La suspension de la réforme des retraites a été annoncée par Sébastien Lecornu le 14 octobre 2025 et inscrite dans la LFSS 2026, sans aucun relèvement de l''âge jusqu''en janvier 2028, la durée d''assurance étant maintenue à 170 trimestres.**

Annoncée par S. Lecornu le 14 octobre 2025, inscrite dans la LFSS 2026. Aucun relèvement de l''âge jusqu''en janvier 2028, durée d''assurance maintenue à 170 trimestres.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Pourquoi cette suspension ?',
      '**La suspension est un compromis politique destiné à éviter une motion de censure du PS et à garantir la survie du gouvernement, validée par le vote du 16 octobre 2025.**

Compromis politique pour éviter une motion de censure du PS et garantir la survie du gouvernement (vote du 16 octobre 2025).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Date d''application ?',
      '**La suspension s''applique aux pensions prenant effet à compter du 1er septembre 2026, la loi ayant été adoptée définitivement le 16 décembre 2025 puis validée par le Conseil constitutionnel le 30 décembre.**

Pour les pensions prenant effet à compter du 1er septembre 2026. Loi adoptée définitivement le 16 décembre 2025, validée par le Conseil constitutionnel le 30 décembre.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Bénéficiaires concrets ?',
      '**64 000 personnes pourront partir plus tôt en 2026 sur 854 000 retraites attribuées, dont 10 000 à 15 000 carrières longues, essentiellement des personnes nées en 1964 à l''automne.**

64 000 personnes pourront partir plus tôt en 2026 (sur 854 000 retraites attribuées), dont 10 000 à 15 000 carrières longues. Essentiellement nés en 1964 (à l''automne).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Coût de la suspension ?',
      '**Le coût de la suspension est de 400 millions d''euros en 2026 et de 1,8 milliard d''euros en 2027, montants devant être compensés par des économies pour ne pas creuser le déficit.**

400 M€ en 2026 et 1,8 Md€ en 2027. Doit être compensée par des économies pour ne pas creuser le déficit.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Enjeux structurels du système de retraite ?',
      '**Les enjeux structurels du système de retraite sont le vieillissement démographique avec un rapport actifs sur retraités en baisse, l''équilibre financier, l''équité entre générations, la pénibilité, les retraites des femmes et la réforme des pensions de réversion.**

Vieillissement démographique (rapport actifs/retraités en baisse), équilibre financier, équité entre générations, pénibilité, retraites des femmes, réforme des pensions de réversion.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Niveau d''inflation en France en 2026 ?',
      '**L''inflation en France atteint 1,7% sur un an en mars 2026 après 0,9% en février, ce qui place la France juste derrière Chypre comme pays de la zone euro avec la plus basse inflation, et elle devrait franchir 2% au printemps.**

1,7% sur un an en mars 2026 (après 0,9% en février). La France est, juste derrière Chypre, le pays de la zone euro avec la plus basse inflation. Devrait franchir 2% au printemps.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Prix du gaz au 1er mai 2026 ?',
      '**Le prix du gaz augmente de 15,4% TTC au 1er mai 2026 selon la CRE, soit 6,19 euros de plus en moyenne par mois, conséquence de la guerre au Moyen-Orient et de la crise sur le marché du gaz.**

+15,4% TTC selon la CRE (soit +6,19 €/mois en moyenne). Conséquence de la guerre au Moyen-Orient et de la crise sur le marché du gaz.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'CRE ?',
      '**La CRE est la Commission de Régulation de l''Énergie, autorité administrative indépendante qui publie chaque mois le prix repère du gaz depuis la fin des tarifs réglementés en juin 2023.**

Commission de Régulation de l''Énergie. Autorité administrative indépendante. Publie chaque mois le « prix repère » du gaz depuis fin des tarifs réglementés (juin 2023).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Facteurs d''inflation 2026 ?',
      '**Les facteurs d''inflation en 2026 sont les tensions géopolitiques au Moyen-Orient et dans le détroit d''Ormuz, le prix de l''énergie avec un carburant en hausse de 7,3% par an en mars, l''alimentation à 1,8%, le tabac à 3,2% et les services à 1,7%.**

Tensions géopolitiques (Moyen-Orient, détroit d''Ormuz), prix de l''énergie (carburant +7,3%/an en mars), alimentation (+1,8%), tabac (+3,2%), services (+1,7%).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Souveraineté énergétique française ?',
      '**La souveraineté énergétique française repose sur la relance du nucléaire avec 6 EPR2 et l''étude de 8 supplémentaires, le développement des renouvelables, la fin de l''ARENH en 2026 et la diversification du gaz pour passer de 45% en 2021 à 0% de gaz russe fin 2027.**

Relance du nucléaire (6 EPR2 + études de 8 supplémentaires), développement des renouvelables, fin de l''ARENH en 2026, diversification du gaz (Russie : 45% en 2021 → 0% fin 2027).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Protection des ménages par l''État ?',
      '**La protection des ménages s''est appuyée sur le bouclier tarifaire 2021-2023, le chèque énergie, MaPrimeRénov'' et des aides ciblées sur le carburant en discussion en mai 2026, dans une tension entre soutien au pouvoir d''achat et maîtrise du déficit.**

Bouclier tarifaire (2021-2023), chèque énergie, MaPrimeRénov'', aides ciblées sur le carburant en discussion en mai 2026. Tension entre soutien au pouvoir d''achat et maîtrise du déficit.'
    );

    -- Stack 9: Démocratie, décentralisation, services publics
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 09. Démocratie, décentralisation, services publics',
      '15 cartes sur la crise parlementaire, les municipales 2026, le projet de loi décentralisation, le statut de l''élu local, France Services et VIGINUM.',
      '__starter:cdc-attache-v4__:stack-09',
      15,
      15,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Pourquoi parle-t-on de blocage à l''Assemblée ?',
      '**Depuis la dissolution de juin 2024, l''Assemblée nationale est fragmentée en trois blocs (NFP, bloc central, RN) sans majorité absolue, ce qui se traduit par un usage fréquent du 49.3, des motions de censure, des échecs de CMP et le recours à des lois spéciales.**

Depuis la dissolution de juin 2024, l''Assemblée est fragmentée en 3 blocs (NFP, bloc central, RN), sans majorité absolue. Conséquences : 49.3 fréquent, motions de censure, échecs de CMP, lois spéciales.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Combien de gouvernements depuis 2024 ?',
      '**Depuis 2024, six gouvernements se sont succédé : Borne, Attal, Barnier censuré en décembre 2024, Bayrou censuré en septembre 2025, Lecornu I qui a démissionné en octobre 2025 et Lecornu II en octobre 2025 remanié en février 2026, instabilité inédite sous la Ve République.**

Borne, Attal, Barnier (censuré décembre 2024), Bayrou (censuré septembre 2025), Lecornu I (démissionne octobre 2025), Lecornu II (octobre 2025, remanié février 2026). Instabilité inédite sous la Ve.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Motion de censure ?',
      '**La motion de censure est la procédure prévue aux articles 49.2 ou 49.3 de la Constitution par laquelle l''Assemblée nationale renverse le gouvernement à la majorité absolue, comme cela a été le cas pour Bayrou en septembre 2025.**

Procédure par laquelle l''Assemblée renverse le gouvernement (article 49.2 ou 49.3 de la Constitution). Adoptée à la majorité absolue. Bayrou en a été victime en septembre 2025.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Municipales 2026 ?',
      '**Les élections municipales de 2026 se tiennent les 15 et 22 mars 2026 dans toutes les communes et constituent un test politique majeur juste après le remaniement Lecornu II.**

Élections les 15 et 22 mars 2026 dans toutes les communes. Test politique majeur juste après le remaniement Lecornu II.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Projet de loi décentralisation en cours ?',
      '**Le projet de loi en cours est le projet de loi visant à renforcer l''État local, articuler son action avec les collectivités territoriales et sécuriser les décideurs publics, texte resserré à 12 articles transmis au Conseil d''État.**

« Projet de loi visant à renforcer l''État local, articuler son action avec les collectivités territoriales et sécuriser les décideurs publics ». Texte resserré à 12 articles, transmis au Conseil d''État.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Calendrier ?',
      '**Le projet de loi sera déposé au Sénat après les municipales, en avril 2026, et ne sera pas un grand acte de décentralisation contrairement aux annonces initiales.**

Déposé au Sénat après les municipales (avril 2026). Ne sera pas un « grand acte » contrairement aux annonces initiales.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Principales dispositions ?',
      '**Les principales dispositions sont le renforcement du préfet comme guichet unique des subventions, l''élargissement de son pouvoir de dérogation et son intervention en cas de carence d''une collectivité, le placement des services de l''ADEME sous l''autorité du préfet de région, ainsi que la réforme des ARS.**

Renforcement du préfet (« guichet unique » des subventions, pouvoir de dérogation élargi, intervention en cas de carence d''une collectivité), services ADEME sous autorité du préfet de région, réforme des ARS.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Compétence à décentraliser ?',
      '**Le logement est cité par Françoise Gatel comme la compétence à décentraliser davantage.**

Le logement est cité par F. Gatel comme compétence à décentraliser davantage.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Loi statut de l''élu local ?',
      '**La loi statut de l''élu local a été adoptée en deuxième lecture par le Sénat en octobre 2025 puis par l''Assemblée en décembre 2025 et améliore les conditions d''exercice des mandats locaux dans un contexte de hausse des démissions de maires, en agissant sur les indemnités, la formation et la protection juridique.**

Adoptée en 2e lecture Sénat (oct. 2025) puis Assemblée (déc. 2025). Améliore les conditions d''exercice des mandats locaux dans un contexte de hausse des démissions de maires (indemnités, formation, protection juridique).'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Autres textes 2026 sur les collectivités ?',
      '**Les autres textes 2026 sur les collectivités sont la loi NIS 2 sur la cybersécurité de janvier 2026, des ajustements ZAN, la loi JOP 2030 et un texte de simplification des règles applicables aux collectivités.**

Loi NIS 2 cybersécurité (janvier 2026), ajustements ZAN, loi JOP 2030, texte de simplification des règles applicables aux collectivités.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'France Services ?',
      '**France Services est un réseau de plus de 2 800 maisons offrant un accès unique aux services publics du quotidien (CAF, Pôle emploi, impôts, CPAM, retraite) à moins de 30 minutes de chaque Français.**

Réseau de plus de 2 800 maisons offrant un accès unique aux services publics du quotidien (CAF, Pôle emploi, impôts, CPAM, retraite…) à moins de 30 minutes de chaque Français.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'VIGINUM ?',
      '**VIGINUM est le service de l''État rattaché au SGDSN chargé de détecter les ingérences numériques étrangères, et a confirmé deux ingérences à l''approche des municipales 2026.**

Service de l''État (rattaché au SGDSN) chargé de détecter les ingérences numériques étrangères. A confirmé deux ingérences à l''approche des municipales 2026.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Démocratie participative ?',
      '**La démocratie participative regroupe les dispositifs associant les citoyens à la décision : conventions citoyennes (Climat 2019, Fin de vie 2023), CNDP, budgets participatifs locaux et consultations en ligne.**

Dispositifs associant les citoyens à la décision : Conventions citoyennes (Climat 2019, Fin de vie 2023), CNDP, budgets participatifs locaux, consultations en ligne.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Service public à la française ?',
      '**Le service public à la française est une activité d''intérêt général organisée par une personne publique ou sous son contrôle, soumise aux principes d''égalité, de continuité et de mutabilité.**

Activité d''intérêt général, organisée par une personne publique ou sous son contrôle, soumise aux principes d''égalité, continuité, mutabilité.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Confiance dans l''action publique ?',
      '**La confiance dans l''action publique est un enjeu majeur car selon le CEVIPOF la défiance envers les institutions est forte, à laquelle on répond par la transparence (HATVP, open data), l''évaluation, la proximité (France Services), l''éthique et la déontologie.**

Enjeu majeur : selon CEVIPOF, défiance forte envers les institutions. Réponses : transparence (HATVP, open data), évaluation, proximité (France Services), éthique et déontologie.'
    );

    -- Stack 10: Mises en situation managériales
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 10. Mises en situation managériales',
      '5 mises en situation extraites du rapport jury Principalat 2025 : absentéisme, conflit, désobéissance hiérarchique, RPS, réorganisation.',
      '__starter:cdc-attache-v4__:stack-10',
      5,
      5,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mise en situation : absentéisme',
      '**Face à l''absentéisme, il faut identifier les causes (santé, conditions de travail, démotivation, RPS), agir individuellement avec entretiens et soutien et collectivement avec une analyse globale, des indicateurs et un plan d''action partagé avec les RH, en mobilisant la médecine du travail si besoin et en traçant le suivi.**

Identifier les causes (santé, conditions de travail, démotivation, RPS). Agir individuellement (entretien, écoute, soutien) ET collectivement (analyse globale, indicateurs, plan d''action avec RH). Mobiliser la médecine du travail si besoin. Tracer, suivre.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mise en situation : conflit entre deux agents',
      '**Face à un conflit entre deux agents, il ne faut pas éviter mais recevoir chaque partie séparément, objectiver les faits, identifier la cause réelle (organisation, ego, charge), proposer une médiation, recadrer si besoin, formaliser des règles, suivre dans le temps et mobiliser pairs et hiérarchie.**

Ne pas éviter. Recevoir chaque partie séparément. Objectiver les faits. Identifier la cause réelle (organisation, ego, charge…). Proposer une médiation, recadrer si besoin, formaliser des règles, suivre dans le temps. Mobiliser pairs et hiérarchie.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mise en situation : désobéissance hiérarchique',
      '**Face à une désobéissance hiérarchique, il faut comprendre la cause (incompréhension, désaccord de fond, RPS), conduire un entretien clair rappelant le cadre statutaire (devoir d''obéissance sauf ordre manifestement illégal), écouter le désaccord, rechercher un compromis si possible, sanctionner de manière graduée si répétition et tracer.**

Comprendre la cause (incompréhension, désaccord de fond, RPS). Entretien clair rappelant le cadre statutaire (devoir d''obéissance sauf ordre manifestement illégal), écoute du désaccord, recherche d''un compromis si possible, sanction graduée si répétition. Tracer.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mise en situation : RPS dans l''équipe',
      '**Face à des risques psychosociaux dans l''équipe, il faut détecter les signaux faibles (absentéisme, tensions, retrait), recevoir les agents, évaluer le climat, mobiliser les acteurs (médecine du travail, RH, RSST), agir sur l''organisation (charge, sens, autonomie), prévenir et tracer, sachant que le manager n''est jamais seul.**

Détecter les signaux faibles (absentéisme, tensions, retrait). Recevoir les agents, évaluer le climat, mobiliser les acteurs (médecine du travail, RH, RSST). Agir sur l''organisation (charge, sens, autonomie). Prévenir et tracer. Le manager n''est jamais seul.'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Mise en situation : réorganisation de service',
      '**Face à une réorganisation de service, la méthode repose sur un diagnostic partagé, une vision claire, une communication transparente, l''association des agents, un accompagnement individualisé (formation, mobilité), le pilotage des résistances, des étapes lisibles et un retour d''expérience, en accordant une grande importance au dialogue social.**

Diagnostic partagé, vision claire, communication transparente, association des agents, accompagnement individualisé (formation, mobilité), pilotage des résistances, étapes lisibles, retour d''expérience. Importance du dialogue social.'
    );

    -- Stack 11: Questions d'avis — réponses courtes prêtes à dire
    INSERT INTO public.flashcard_decks
      (user_id, name, description, source_pdf_name, total_cards, new_count, due_count)
    VALUES (
      target_user_id,
      'CDC 11. Questions d''avis — réponses courtes prêtes à dire',
      '15 réponses orales calibrées (60-80 mots, ~45 secondes) aux questions ouvertes du jury : retraites, 49.3, décentralisation, écologie, logement, IA, attractivité.',
      '__starter:cdc-attache-v4__:stack-11',
      15,
      15,
      0
    ) RETURNING id INTO v_deck_id;

    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que pensez-vous de la suspension de la réforme des retraites ?',
      '**C''est un compromis politique conjoncturel qui évite une censure et apporte un répit à 64 000 personnes en 2026, mais qui coûte 400 millions en 2026 puis 1,8 milliard en 2027 sans régler les enjeux structurels du système, ce qui appelle pour la CDC une réflexion sur la soutenabilité.**

*« C''est un compromis politique conjoncturel qui a évité une censure et apporte un répit à 64 000 personnes en 2026. Mais elle coûte 400 M€ en 2026 et 1,8 Md€ en 2027 et ne règle aucun enjeu de fond. Pour la CDC, qui gère un retraité sur cinq via la CNRACL et l''Ircantec, cela appelle une réflexion sur la soutenabilité du système, reportée à 2027. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que pensez-vous du recours au 49.3 pour le budget 2026 ?',
      '**Le 49.3 est un outil constitutionnel légitime pour gouverner sans majorité absolue, mais son usage après 350 heures de débats et l''échec de la CMP révèle une crise du compromis parlementaire et pose la question de la modernisation des institutions.**

*« Le 49.3 est un outil constitutionnel légitime, prévu pour gouverner sans majorité absolue. Mais son usage après 350 heures de débats et l''échec de la CMP révèle une vraie crise du compromis parlementaire. Plusieurs gouvernements sont tombés depuis 2024. Le problème n''est pas l''outil, c''est la fragmentation politique. Cela ouvre le débat sur la modernisation de nos institutions. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quel est votre avis sur la décentralisation en cours ?',
      '**Le projet attendu après les municipales est plus modeste qu''annoncé avec 12 articles centrés sur le rôle du préfet plutôt qu''un grand transfert de compétences, ce qui est pragmatique dans un Parlement bloqué mais déçoit les élus locaux et reporte au PLF 2027 l''articulation entre compétences et ressources.**

*« Le projet attendu après les municipales est plus modeste qu''annoncé : 12 articles, recentrés sur le rôle du préfet plutôt qu''un grand transfert de compétences. C''est pragmatique dans un Parlement bloqué, mais cela déçoit les élus locaux. Pour la BDT, partenaire financier des collectivités, l''enjeu central reste l''articulation entre compétences et ressources, qui n''est pas traitée avant le PLF 2027. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quel est votre regard sur l''inflation et les prix de l''énergie ?',
      '**L''inflation reste modérée à 1,7% en mars 2026, mais les tensions au Moyen-Orient ont fait remonter le gaz de 15,4% en mai, ce qui pèse sur les ménages modestes et appelle pour la CDC à accompagner les bailleurs sociaux et financer la transition énergétique.**

*« L''inflation reste modérée à 1,7% en mars 2026 — la France est l''un des pays les plus bas de la zone euro. Mais les tensions au Moyen-Orient ont fait remonter le gaz de 15,4% en mai. Pour les ménages modestes, l''impact sur le budget est réel. Pour la CDC, c''est un double enjeu : accompagner les bailleurs sociaux et financer la transition énergétique pour réduire la dépendance. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Comment la CDC contribue-t-elle à la transition écologique ?',
      '**Le Groupe a engagé 100 milliards sur 2024-2028, déjà 40 milliards mobilisés en 18 mois, la BDT seule portant 90 milliards via 16 mesures phares, avec un objectif de moins 55% d''empreinte carbone des portefeuilles en 2030, ce qui se traduit par la rénovation thermique, les EnR, la mobilité décarbonée, la sobriété foncière et la biodiversité.**

*« Le Groupe a engagé 100 Md€ sur 2024-2028, déjà 40 Md€ mobilisés en 18 mois. La BDT seule porte 90 Md€ avec 16 mesures phares — logement et transport en priorité. La CDC vise -55% d''empreinte carbone de ses portefeuilles en 2030. Concrètement : rénovation thermique, EnR, mobilité décarbonée, sobriété foncière, biodiversité. C''est notre rôle d''investisseur de long terme. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quels sont les enjeux de la dette publique pour la CDC ?',
      '**La CDC n''est pas concernée directement comme établissement sui generis, mais les contraintes budgétaires impactent les missions qu''elle porte (logement social, santé, IA souveraine), et avec une dette à 115,6% du PIB et un déficit à 5,1%, son rôle d''investisseur de long terme prend d''autant plus de sens.**

*« La CDC n''est pas concernée directement comme établissement sui generis, mais les contraintes budgétaires impactent les missions qu''elle porte : logement social, santé, IA souveraine. Avec la dette à 115,6% du PIB et un déficit à 5,1%, le rôle d''investisseur de long terme prend d''autant plus de sens : préparer l''avenir quand l''État doit se serrer la ceinture. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quel est votre regard sur la crise du logement ?',
      '**La crise du logement est structurelle (effondrement de la construction neuve, hausse des taux 2022-2024, allongement des files d''attente HLM), et la CDC joue un rôle contracyclique spectaculaire avec 28,5 milliards de prêts en 2024 (+74% vs 2023) soit 40% de la production neuve française, illustration parfaite de notre mission d''intérêt général.**

*« Crise structurelle : effondrement de la construction neuve, hausse des taux 2022-2024, allongement des files d''attente HLM. La CDC joue son rôle contracyclique de manière spectaculaire : 28,5 Md€ de prêts en 2024, +74% vs 2023, soit 40% de la production neuve française. C''est l''illustration parfaite de notre mission d''intérêt général dans un contexte de retrait du marché privé. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que pensez-vous du plan Horizon Numérique 2030 ?',
      '**18 milliards d''euros pour la souveraineté numérique européenne, c''est une réponse stratégique forte face aux GAFAM, qui s''appuie sur l''ADN de tiers de confiance de la CDC (partenariats Mistral AI, Sopra Steria, Computacenter, IA Factory, Campus IA) tout en transformant la CDC en interne avec 40 000 licences IA générative déployées.**

*« 18 Md€ pour la souveraineté numérique européenne, c''est une réponse stratégique forte face aux GAFAM. La CDC s''appuie sur son ADN de tiers de confiance : partenariats Mistral AI, Sopra Steria, Computacenter, IA Factory, Campus IA. Et cela transforme aussi la CDC en interne : 40 000 licences IA générative déployées. C''est cohérent avec l''objectif stratégique de souveraineté du Groupe. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Comment voyez-vous l''attractivité de la fonction publique ?',
      '**C''est un enjeu majeur du plan DGAFP 2030 face au vieillissement et aux tensions de recrutement, avec des leviers comme le sens du service public, la qualité de vie au travail, le télétravail, la protection sociale complémentaire et la formation continue, illustré à la CDC par la démarche Grandissons ensemble et l''année des diversités.**

*« Enjeu majeur du plan DGAFP 2030 face au vieillissement et aux tensions de recrutement. Les leviers sont nombreux : sens du service public, qualité de vie au travail, télétravail, protection sociale complémentaire, formation continue. À la CDC, la démarche Grandissons ensemble et l''année des diversités illustrent cette ambition : faire du service public un employeur attractif et exemplaire. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que pensez-vous des modèles managériaux de la CDC ?',
      '**La démarche Grandissons ensemble structure une culture managériale commune autour de l''esprit de service, de la responsabilité et de l''exemplarité, le défi étant l''articulation entre l''établissement public et 120 000 collaborateurs aux cultures différentes, avec un management bienveillant et exigeant comme boussole.**

*« La démarche Grandissons ensemble structure une culture managériale commune au Groupe, autour de valeurs partagées : esprit de service, responsabilité, exemplarité. Le défi, c''est l''articulation entre l''établissement public et 120 000 collaborateurs aux cultures différentes (BDT, Bpifrance, La Poste, CNP…). Le management bienveillant et exigeant est notre boussole : écoute, sens, mais aussi clarté et arbitrage. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Que savez-vous de l''année des diversités à la CDC ?',
      '**C''est un engagement structurant du Groupe sur l''inclusion (égalité femmes-hommes, handicap, origines sociales, intergénérationnel, LGBT+) qui se traduit par des accords diversité, des indicateurs comme l''Index Pénicaud, des actions de sensibilisation et un recrutement inclusif, en cohérence avec notre mission d''intérêt général.**

*« C''est un engagement structurant du Groupe sur l''inclusion : égalité femmes/hommes, handicap, origines sociales, intergénérationnel, LGBT+. Cela se traduit par des accords diversité, des indicateurs comme l''Index Pénicaud, des actions de sensibilisation et un recrutement inclusif. C''est cohérent avec notre mission d''intérêt général : le service public doit refléter la société qu''il sert. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Comment la CDC répond-elle au vieillissement ?',
      '**Avec une feuille de route 25 milliards santé et grand âge à horizon 2030, dont 6 milliards déjà mobilisés en 2025, finançant 250 structures sanitaires et 200 médico-sociales, en mobilisant les filiales (EMEIS, Arpavie rapproché du Groupe SOS Seniors, Icade Santé) et la BDT contre les déserts médicaux via les MSP et la télémédecine.**

*« Feuille de route 25 Md€ santé/grand âge à horizon 2030, déjà 6 Md€ mobilisés en 2025. 250 structures sanitaires + 200 médico-sociales financées. Filiales mobilisées : EMEIS, Arpavie (rapproché du Groupe SOS Seniors), Icade Santé. La BDT lutte aussi contre les déserts médicaux via les MSP et la télémédecine. C''est une réponse globale au défi démographique. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Quel type de manager voulez-vous être ?',
      '**Un manager qui combine bienveillance et exigence : écouter, reconnaître, soutenir et donner du sens d''un côté ; fixer un cap clair, arbitrer, rendre compte et oser recadrer de l''autre, dans une posture d''humilité car un manager n''est jamais seul et doit incarner les valeurs du service public.**

*« Un manager qui combine bienveillance et exigence. Bienveillance, c''est écouter, reconnaître, soutenir, donner du sens. Exigence, c''est fixer un cap clair, arbitrer, rendre compte, ne pas avoir peur de recadrer. Je crois aussi à l''humilité : un manager n''est jamais seul, il s''appuie sur ses pairs, sa hiérarchie, ses équipes. Et il doit incarner les valeurs du service public. »*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Pourquoi passez-vous cet examen professionnel ?',
      '**Réponse à personnaliser : structurer autour de la motivation profonde (sens du service public, projection vers des responsabilités), de ce qu''apporte le parcours actuel (compétences acquises, hauteur de vue) et de ce que l''on veut apporter en tant qu''attaché (vision d''un poste type, contribution à la CDC), en évitant les formules creuses.**

*[À personnaliser] Idée de structure : ma motivation profonde (sens du service public, projection vers des responsabilités), ce que m''apporte mon parcours actuel (compétences acquises, hauteur de vue), ce que je veux apporter en tant qu''attaché (vision d''un poste type, contribution à la CDC). Éviter « prendre des responsabilités plus importantes » sans contenu.*'
    );
    INSERT INTO public.flashcard_cards (deck_id, user_id, card_type, front, back) VALUES (
      v_deck_id,
      target_user_id,
      'basic',
      'Comment vous projetez-vous sur un poste de catégorie A ?',
      '**Réponse à personnaliser : évoquer un type de poste précis (chef de projet, adjoint au responsable, chargé de mission stratégique), une direction d''intérêt et des missions concrètes (pilotage, encadrement, coordination, expertise), sans dire que l''on souhaite rester sur son poste actuel car le jury attend une vraie projection.**

*[À personnaliser] Évoquer un type de poste précis (chef de projet, adjoint au responsable, chargé de mission stratégique), une direction d''intérêt, des missions concrètes (pilotage, encadrement, coordination, expertise). Ne PAS dire que vous voulez rester sur votre poste actuel. Le jury attend une vraie projection.*'
    );

    v_done := v_done + 1;
  END LOOP;
  RAISE NOTICE 'Done: % users updated', v_done;
END $$;
