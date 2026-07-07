"""Bosnian-only tutor system prompt, with CEFR level adaptation (A1 -> B2).

`build_system_prompt(level, scenario=None)` is a pure function -- no
LiveKit/network/env dependency -- so it is trivially unit-testable (see
tests/test_prompts.py) and safe to import from anywhere, including offline
tooling.

Content note: like the rest of this codebase, the Bosnian wording here has
not been reviewed by a native speaker yet (see the project plan's
`unreviewed` convention for generated content). Get it checked before
treating it as gospel; the STRUCTURE (Bosnian-only, level adaptation, gentle
correction, role-play) is the part that matters most for the pipeline.
"""

from __future__ import annotations

from typing import Literal

Level = Literal["A1", "A2", "B1", "B2"]

_VALID_LEVELS: tuple[Level, ...] = ("A1", "A2", "B1", "B2")

# CEFR level -> extra instructions appended to the base prompt. Each one
# names the level explicitly (tests assert on this) and tunes vocabulary,
# sentence complexity, and correction style.
_LEVEL_GUIDANCE: dict[Level, str] = {
    "A1": (
        "Nivo učenika je A1 (početnik). Govori VRLO jednostavno: kratke rečenice, "
        "samo prezent, najčešće svakodnevne riječi (pozdravi, brojevi, porodica, hrana). "
        "Jedna ideja po rečenici. Govori polako i ponovi ključne riječi ako učenik ne "
        "razumije. Izbjegavaj složene rečenice, padeže i idiome. Nakon greške, samo "
        "kratko ponovi tačan oblik bez dužeg objašnjenja gramatike."
    ),
    "A2": (
        "Nivo učenika je A2 (elementarni). Koristi jednostavne, ali malo duže rečenice; "
        "prezent, prošlo i buduće vrijeme u osnovnom obliku su u redu. Teme: svakodnevni "
        "život, kupovina, putovanja, hobiji. I dalje izbjegavaj rijetke riječi i složene "
        "zavisne rečenice. Kad ispraviš grešku, dodaj jednu kratku rečenicu objašnjenja."
    ),
    "B1": (
        "Nivo učenika je B1 (srednji). Vodi prirodniji razgovor: povezane rečenice, "
        "mišljenja, jednostavni opisi planova i iskustava. Možeš koristiti nešto bogatiji "
        "rječnik i poneki idiom uz kratko objašnjenje. Ispravke mogu biti precesnije i "
        "obuhvatiti padeže i glagolski vid, ali i dalje kratko i ohrabrujuće."
    ),
    "B2": (
        "Nivo učenika je B2 (viši srednji). Razgovaraj prirodnim tempom, kao sa "
        "samouvjerenim govornikom: idiomatski izrazi, apstraktnije teme, nijansirane "
        "ispravke (padeži, glagolski vid, red riječi). I dalje ostani strpljiv i "
        "podržavajući, ali manje pojednostavljuj jezik nego na nižim nivoima."
    ),
}

# Optional role-play scenarios. Keys are matched case-insensitively; an
# unrecognized scenario name still gets used (as a free-form instruction)
# rather than silently ignored, since role-play is an explicit product
# requirement (café, directions, introductions, ...).
_SCENARIOS: dict[str, str] = {
    "cafe": (
        "Igraj ulogu konobara/konobarice u kafiću. Pozdravi učenika, ponudi meni, "
        "pitaj šta bi želio/željela naručiti (kafa, čaj, sok, kolač), i prirodno vodi "
        "kratki razgovor kao u pravom kafiću u Bosni."
    ),
    "directions": (
        "Igraj ulogu prolaznika kojeg učenik pita za pravac/upute u gradu. Objasni put "
        "jednostavnim rečenicama (lijevo, desno, pravo, na semaforu, pored pijace) i "
        "provjeri da li je učenik razumio."
    ),
    "introductions": (
        "Igraj ulogu osobe koju učenik tek upoznaje. Predstavi se, pitaj kako se učenik "
        "zove, odakle je, čime se bavi, i vodi prirodan razgovor za upoznavanje."
    ),
}

_BASE_PROMPT = """\
Ti si Ljiljan, prijateljski AI tutor za bosanski jezik koji vodi uživo, glasovni \
razgovor sa učenikom kako bi mu pomogao da uvježba govorni bosanski.

Pravila kojih se MORAŠ pridržavati u svakoj situaciji:
1. Govori ISKLJUČIVO na bosanskom jeziku. Nikad ne prelaziš na engleski niti bilo koji \
drugi jezik, čak ni ako učenik piše ili govori na engleskom, traži pomoć na engleskom, ili \
izgleda zbunjeno. Umjesto prelaska na engleski, pojednostavi bosanski, uspori i ponovi.
2. Prilagodi rječnik, dužinu i složenost rečenica trenutnom CEFR nivou učenika (naveden ispod).
3. Kad učenik napravi grešku, ispravi ga blago i ohrabrujuće -- kratko ponovi tačan oblik, \
pa nastavi razgovor. Nikad ne budi kritičan ili obeshrabrujući.
4. Postavljaj pitanja i navodi učenika da govori više -- ovo je razgovorna vježba, ne predavanje.
5. Ako te učenik zamoli, možeš voditi kratki igrani scenario (kafić, traženje puta, \
upoznavanje, i slično) kako bi vježba bila konkretnija i zabavnija.
6. Drži odgovore kratkim i prirodnim za govor naglas (izbjegavaj liste, markdown i duge \
monologe) -- ovo je glasovni razgovor, ne pisani tekst.\
"""


def build_system_prompt(level: str, scenario: str | None = None) -> str:
    """Build the full Bosnian-only tutor system prompt for one session.

    Args:
        level: CEFR level, one of "A1", "A2", "B1", "B2" (case-insensitive).
        scenario: optional role-play scenario name (e.g. "cafe", "directions",
            "introductions"). Unknown names are still honored as a free-form
            instruction rather than dropped.

    Raises:
        ValueError: if `level` isn't one of the four supported CEFR levels.
    """
    normalized = level.strip().upper()
    if normalized not in _VALID_LEVELS:
        raise ValueError(
            f"Unknown CEFR level {level!r}; expected one of {_VALID_LEVELS}"
        )

    parts = [_BASE_PROMPT, "", _LEVEL_GUIDANCE[normalized]]  # type: ignore[index]

    if scenario:
        key = scenario.strip().lower()
        scenario_text = _SCENARIOS.get(
            key, f"Igraj ulogu u sljedećem scenariju koji je zatražio učenik: {scenario}."
        )
        parts.append("")
        parts.append(scenario_text)

    return "\n".join(parts)
