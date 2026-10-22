"""
Rehab & Testing Dashboard v3 — Leeds United colours.
v3 adds: injured-side LSI (injured ÷ uninjured), live exit criteria (test / measure / operator / threshold
evaluate from the latest data, with manual override), latest-by-date (not by row), and a rehab-week stamp on
every test row with week-on-the-x-axis progression charts (XY scatter so spacing is proportional).
"""
import datetime as dt
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.formatting.rule import FormulaRule
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.chart import LineChart, ScatterChart, Reference, Series
from openpyxl.chart.marker import Marker
from openpyxl.chart.series import SeriesLabel
from openpyxl.chart.data_source import StrRef
from openpyxl.comments import Comment

OUT = "/home/claude/Rehab_Testing_Dashboard_LUFC_v5_TickBox.xlsx"

# ------------------------------------------------------------------ palette
BLUE, YELLOW = "1D428A", "FFCD00"
MID_BLUE = "2F5DAD"
LIGHT_BLUE, PALE_BLUE, INPUT = "DCE4F5", "EEF2FA", "FFF8DC"
WHITE, GREY_TXT, BORDER_GREY, FAINT, GREY_CELL = "FFFFFF", "595959", "BFBFBF", "D9D9D9", "EDEDED"
GOOD_FILL, GOOD_FONT = "C6EFCE", "006100"
WARN_FILL, WARN_FONT = "FFEB9C", "9C5700"
BAD_FILL, BAD_FONT = "FFC7CE", "9C0006"
SERIES = ["2F5DAD", "B98A00", "C8453F", "228B6B", "8A5BB8", "D9731A", "2A9DB8", "A0522D"]
MARKERS = ["circle", "triangle", "square", "diamond", "x", "star", "plus", "dash"]
FONT_NAME = "Arial"


def fill(h): return PatternFill("solid", fgColor=h)
def font(bold=False, color="000000", size=10, italic=False):
    return Font(name=FONT_NAME, bold=bold, color=color, size=size, italic=italic)


THIN = Side(style="thin", color=BORDER_GREY)
HAIR = Side(style="thin", color=FAINT)
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BOTTOM = Border(bottom=HAIR)
YELLOW_RULE = Border(bottom=Side(style="medium", color=YELLOW))
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
LEFT = Alignment(horizontal="left", vertical="center", wrap_text=True)


def style_range(ws, rng, *, f=None, fnt=None, align=None, border=BOX, numfmt=None):
    for row in ws[rng]:
        for c in row:
            if f is not None: c.fill = fill(f)
            if fnt is not None: c.font = fnt
            if align is not None: c.alignment = align
            if border is not None: c.border = border
            if numfmt is not None: c.number_format = numfmt


def put(ws, ref, value, *, f=None, fnt=None, align=None, border=BOX, numfmt=None, merge_to=None):
    ws[ref] = value
    rng = f"{ref}:{merge_to}" if merge_to else f"{ref}:{ref}"
    if merge_to: ws.merge_cells(rng)
    style_range(ws, rng, f=f, fnt=fnt or font(), align=align or LEFT, border=border, numfmt=numfmt)


def section_header(ws, row, text, c1, c2, size=12):
    put(ws, f"{c1}{row}", text, f=BLUE, fnt=font(True, WHITE, size), merge_to=f"{c2}{row}")
    ws.row_dimensions[row].height = 20


def light_title(ws, row, text, c1, c2):
    put(ws, f"{c1}{row}", text, fnt=font(True, BLUE, 11), border=YELLOW_RULE, merge_to=f"{c2}{row}")
    ws.row_dimensions[row].height = 20


def col_headers(ws, row, headers, start_col=1, f=MID_BLUE, color=WHITE, size=10, height=30):
    col = start_col
    for text, span in headers:
        a = f"{get_column_letter(col)}{row}"
        b = f"{get_column_letter(col + span - 1)}{row}" if span > 1 else None
        put(ws, a, text, f=f, fnt=font(True, color, size), align=CENTER, merge_to=b)
        col += span
    ws.row_dimensions[row].height = height


def status_cf(ws, rng):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(
        formula=[f'OR({first}="READY",{first}="COMPLETE",{first}="MET",{first}="Y")'],
        fill=fill(GOOD_FILL), font=Font(name=FONT_NAME, bold=True, color=GOOD_FONT)))
    ws.conditional_formatting.add(rng, FormulaRule(
        formula=[f'{first}="IN PROGRESS"'], fill=fill(WARN_FILL), font=Font(name=FONT_NAME, bold=True, color=WARN_FONT)))
    ws.conditional_formatting.add(rng, FormulaRule(
        formula=[f'OR({first}="NOT READY",{first}="NOT STARTED",{first}="BELOW",{first}="N",{first}="NOT MET")'],
        fill=fill(BAD_FILL), font=Font(name=FONT_NAME, bold=True, color=BAD_FONT)))


def ratio_cf(ws, rng, good="0.9", warn="0.8"):
    first = rng.split(":")[0]
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"AND(ISNUMBER({first}),{first}>={good})"], fill=fill(GOOD_FILL), font=Font(name=FONT_NAME, color=GOOD_FONT)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"AND(ISNUMBER({first}),{first}>={warn},{first}<{good})"], fill=fill(WARN_FILL), font=Font(name=FONT_NAME, color=WARN_FONT)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"AND(ISNUMBER({first}),{first}<{warn})"], fill=fill(BAD_FILL), font=Font(name=FONT_NAME, color=BAD_FONT)))


def _style_series(s, i):
    col = SERIES[i % len(SERIES)]
    s.graphicalProperties.line.solidFill = col
    s.graphicalProperties.line.width = 22000
    s.marker = Marker(symbol=MARKERS[i % len(MARKERS)], size=6)
    s.marker.graphicalProperties.solidFill = col
    s.marker.graphicalProperties.line.solidFill = col
    s.smooth = False


def scatter_chart(ws, anchor, title, x_ref, series, y_title, *, width=10.5, height=7.0, x_title="Rehab week",
                  y_fmt=None, y_min=None, y_max=None, legend=True):
    """XY scatter with straight lines + markers: x = rehab week (proportional spacing), gaps on #N/A / blanks."""
    ch = ScatterChart()
    ch.title = title
    ch.style = 2
    ch.scatterStyle = "lineMarker"
    ch.height, ch.width = height, width
    ch.x_axis.title = x_title
    ch.y_axis.title = y_title
    ch.x_axis.number_format = "0"
    ch.x_axis.scaling.min = 0
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.display_blanks = "gap"
    if y_fmt: ch.y_axis.number_format = y_fmt
    if y_min is not None: ch.y_axis.scaling.min = y_min
    if y_max is not None: ch.y_axis.scaling.max = y_max
    if legend: ch.legend.position = "b"
    else: ch.legend = None
    for i, (y_ref, title_ref) in enumerate(series):
        s = Series(y_ref, x_ref, title_from_data=False)
        s.tx = SeriesLabel(strRef=StrRef(title_ref))
        _style_series(s, i)
        ch.series.append(s)
    ws.add_chart(ch, anchor)
    return ch


def line_chart(ws, anchor, title, cats_ref, series, y_title, *, width=10.5, height=7.0, x_fmt="General",
               y_fmt=None, legend=True, x_title=None):
    ch = LineChart()
    ch.title = title
    ch.style = 2
    ch.height, ch.width = height, width
    ch.y_axis.title = y_title
    if x_title: ch.x_axis.title = x_title
    ch.x_axis.number_format = x_fmt
    ch.x_axis.auto = False
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.display_blanks = "gap"
    if y_fmt: ch.y_axis.number_format = y_fmt
    if legend: ch.legend.position = "b"
    else: ch.legend = None
    for i, (ref, title_ref) in enumerate(series):
        ch.add_data(ref, titles_from_data=False)
        s = ch.series[-1]
        s.tx = SeriesLabel(strRef=StrRef(title_ref))
        _style_series(s, i)
    ch.set_categories(cats_ref)
    ws.add_chart(ch, anchor)
    return ch


def q(sheet): return f"'{sheet}'" if any(ch in sheet for ch in "- &") else sheet


# ====================================================================== spec
wb = Workbook()
wb.calculation.fullCalcOnLoad = True

REGIONS = ["Hip", "Hamstring", "Knee", "Ankle-Foot", "Shoulder"]
PHASES = ["1. Protection", "2. Load Introduction", "3. Specific Loading", "4. Performance Loading", "5. Return to Training", "6. Return to Play"]
CRIT_PER_PHASE = 3
SLOTS = 8
SPARE = "(spare slot — rename)"
JUMP_BATTERY = ["DL CMJ Height (cm)", "SL CMJ Height (cm)", "SL Hop Distance (cm)", "Triple Hop Distance (cm)",
                "Lateral Capacity", "DL Drop Jump RSI", "SL Drop Jump RSI", "10-5 Repeated Hops RSI"]
BILATERAL = {"DL CMJ Height (cm)", "DL Drop Jump RSI", "10-5 Repeated Hops RSI"}
JUMP_TITLE = "Jump Testing — standardised battery"
GPS_LABELS = ["GPS: TD % baseline (best week)", "GPS: HSR % baseline (best week)", "GPS: SD % baseline (best week)",
              "GPS: Acc % baseline (best week)", "GPS: Dec % baseline (best week)", "GPS: Top speed % baseline (best week)"]
MANUAL = "Manual"
GPS_TD, GPS_HSR, GPS_SD = GPS_LABELS[0], GPS_LABELS[1], GPS_LABELS[2]

# criteria rows: (text, test, measure, op, threshold) — test None => Manual; None row => blank
def M(text): return (text, MANUAL, "", "≥", None)
def C(text, test, thr, measure="LSI", op="≥"): return (text, test, measure, op, thr)

REGION_SPEC = {
    "Hip": {
        "focus": "Hip & groin tracker. ROM in degrees; strength = KangaTech hip profile in kg. LSI = injured ÷ uninjured side "
                 "(set the Injured side tile on the Dashboard). Wk = rehab week, stamped automatically from the date.",
        "rom": ["Hip Flexion (°)", "Hip Extension (°)", "Hip IR @ 90° (°)", "Hip ER @ 90° (°)", "Active Abduction (°)", "Passive Abduction (°)"],
        "str": ["Hip Flexion @ 90° (kg)", "Hip Extension (kg)", "Hip IR @ 90° (kg)", "Hip ER @ 90° (kg)", "Adduction @ 30° (kg)", "Abduction @ 30° (kg)", "Hip Flexion @ 60° (kg)"],
        "str_title": "Strength — KangaTech Hip Profile (kg)",
        "criteria": [
            [M("Pain ≤ 2/10 with ADLs, full weight-bearing"), M("No night pain"), None],
            [C("Hip flexion ROM ≥ 90% of other side", "Hip Flexion (°)", 0.9), C("Adduction @ 30° ≥ 70% LSI", "Adduction @ 30° (kg)", 0.7), C("Abduction @ 30° ≥ 70% LSI", "Abduction @ 30° (kg)", 0.7)],
            [C("Adduction @ 30° ≥ 80% LSI", "Adduction @ 30° (kg)", 0.8), C("Hip flexion @ 90° ≥ 80% LSI", "Hip Flexion @ 90° (kg)", 0.8), M("Pain-free linear running")],
            [C("Adduction @ 30° ≥ 90% LSI", "Adduction @ 30° (kg)", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9), C("SL hop ≥ 90% LSI", "SL Hop Distance (cm)", 0.9)],
            [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
            [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Psychological readiness confirmed")],
        ],
    },
    "Hamstring": {
        "focus": "Hamstring tracker — phases follow the Aspetar pathway names (edit freely). LSI = injured ÷ uninjured side "
                 "(set the Injured side tile on the Dashboard). Wk = rehab week, stamped automatically from the date.",
        "phases": ["1. Foundation", "2. Reload", "3. Accumulation", "4. Transition", "5. Simulation", "6. Resilience"],
        "rom": ["Active Knee Extension (°)", "Passive SLR (°)", "Hip Flexion (°)"],
        "str": ["NordBord Eccentric (N)", "Iso Hamstring 90/90 (N)", "Iso Hamstring 30° (N)", "SL Hamstring Bridge (reps)", "Quadriceps Iso (N)"],
        "str_title": "Strength — NordBord / force frame / HHD",
        "criteria": [
            [M("Pain-free walking & ADLs"), C("AKE ≥ 80% of other side", "Active Knee Extension (°)", 0.8), None],
            [C("Iso 90/90 ≥ 80% LSI", "Iso Hamstring 90/90 (N)", 0.8), C("AKE ≥ 90% of other side", "Active Knee Extension (°)", 0.9), M("Pain-free jogging")],
            [C("NordBord eccentric ≥ 80% LSI", "NordBord Eccentric (N)", 0.8), C("Iso 30° ≥ 85% LSI", "Iso Hamstring 30° (N)", 0.85), M("Progressive running tolerated")],
            [C("NordBord eccentric ≥ 90% LSI", "NordBord Eccentric (N)", 0.9), C("SL bridge ≥ 90% LSI", "SL Hamstring Bridge (reps)", 0.9), C("Top speed ≥ 90% of baseline", GPS_LABELS[5], 0.9, "")],
            [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
            [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Match minutes progressed")],
        ],
    },
    "Knee": {
        "focus": "Knee tracker (ACL, meniscus, PFJ, tendinopathy) — Melbourne-guide style battery. LSI = injured ÷ uninjured side "
                 "(set the Injured side tile on the Dashboard). Wk = rehab week, stamped automatically from the date.",
        "rom": ["Knee Flexion (°)", "Knee Extension (° hyperext = +)", "Ankle DF Knee-to-Wall (cm)", "Thigh Circumference 10 cm (cm)"],
        "str": ["Quadriceps Iso (N)", "Hamstrings Iso / NordBord (N)", "Calf Iso (N)", "Iso Hip Abduction (N)"],
        "str_title": "Strength — HHD / force frame / NordBord",
        "criteria": [
            [M("Full extension — no lag on SLR"), M("Effusion ≤ trace (stroke test)"), None],
            [C("Knee flexion ≥ 120° on injured side", "Knee Flexion (°)", 120, "Injured"), C("Quadriceps ≥ 70% LSI", "Quadriceps Iso (N)", 0.7), M("Normalised gait")],
            [C("Quadriceps ≥ 80% LSI", "Quadriceps Iso (N)", 0.8), C("Hamstrings ≥ 80% LSI", "Hamstrings Iso / NordBord (N)", 0.8), M("Pain-free jogging")],
            [C("Quadriceps ≥ 90% LSI", "Quadriceps Iso (N)", 0.9), C("SL hop ≥ 90% LSI", "SL Hop Distance (cm)", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9)],
            [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
            [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("ACL-RSI / psychological readiness")],
        ],
    },
    "Ankle-Foot": {
        "focus": "Ankle & foot tracker (lateral ligament, syndesmosis, Achilles, foot). LSI = injured ÷ uninjured side "
                 "(set the Injured side tile on the Dashboard). Wk = rehab week, stamped automatically from the date.",
        "rom": ["Ankle DF Knee-to-Wall (cm)", "Ankle Plantarflexion (°)", "Inversion (°)", "Eversion (°)"],
        "str": ["SL Heel Raise (reps)", "Iso Plantarflexion (N)", "Iso Inversion (N)", "Iso Eversion (N)"],
        "str_title": "Strength — HHD / force frame / endurance",
        "criteria": [
            [M("Pain & swelling controlled; full weight-bearing"), C("Knee-to-wall ≥ 50% of other side", "Ankle DF Knee-to-Wall (cm)", 0.5), None],
            [C("Knee-to-wall ≥ 85% of other side", "Ankle DF Knee-to-Wall (cm)", 0.85), C("SL heel raise ≥ 15 reps on injured side", "SL Heel Raise (reps)", 15, "Injured"), None],
            [C("Plantarflexion strength ≥ 80% LSI", "Iso Plantarflexion (N)", 0.8), M("Pain-free jogging"), M("SL balance eyes closed ≥ 30 s")],
            [C("Lateral capacity ≥ 90% LSI", "Lateral Capacity", 0.9), C("SL CMJ ≥ 90% LSI", "SL CMJ Height (cm)", 0.9), C("SL drop jump RSI ≥ 90% LSI", "SL Drop Jump RSI", 0.9)],
            [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), C("HSR ≥ 90% of baseline", GPS_HSR, 0.9, ""), M("Full training completed")],
            [C("Total distance ≥ 100% of baseline", GPS_TD, 1.0, ""), C("Sprint distance ≥ 95% of baseline", GPS_SD, 0.95, ""), M("Match minutes progressed")],
        ],
    },
    "Shoulder": {
        "focus": "Shoulder tracker (instability, AC joint, rotator cuff, goalkeepers). LSI = injured ÷ uninjured side "
                 "(set the Injured side tile on the Dashboard). Bilateral tests: enter the score in L. Wk = rehab week.",
        "rom": ["Shoulder Flexion (°)", "ER @ 90° abd (°)", "IR @ 90° abd (°)", "Abduction (°)"],
        "str": ["Iso ER (N)", "Iso IR (N)", "ASH Test — I position (N)", "ASH Test — Y position (N)"],
        "str_title": "Strength — HHD / force plate",
        "criteria": [
            [M("Pain controlled; protected ROM per protocol"), M("Scapular control restored"), None],
            [C("ER @ 90° ROM ≥ 90% of other side", "ER @ 90° abd (°)", 0.9), C("Iso ER ≥ 70% LSI", "Iso ER (N)", 0.7), C("Iso IR ≥ 70% LSI", "Iso IR (N)", 0.7)],
            [C("Iso ER ≥ 80% LSI", "Iso ER (N)", 0.8), C("ASH I-position ≥ 80% LSI", "ASH Test — I position (N)", 0.8), M("Closed-chain loading tolerated")],
            [C("Iso ER ≥ 90% LSI", "Iso ER (N)", 0.9), C("ASH Y-position ≥ 90% LSI", "ASH Test — Y position (N)", 0.9), M("Contact / landing drills completed")],
            [C("Total distance ≥ 90% of baseline", GPS_TD, 0.9, ""), M("Full training incl. contact"), None],
            [M("Match minutes progressed"), M("Psychological readiness confirmed"), None],
        ],
    },
}
for spec in REGION_SPEC.values():
    spec["jmp"], spec["jmp_title"] = JUMP_BATTERY, JUMP_TITLE
    for k in ("rom", "str", "jmp"):
        spec[k] = (list(spec[k]) + [SPARE] * SLOTS)[:SLOTS]

# ---- Row map shared by every region tab
N_CRIT = len(PHASES) * CRIT_PER_PHASE          # 18
R = dict(title=1, focus=2, ph_hdr=4, ph_cols=5, ph_first=6)
R["ph_last"] = R["ph_first"] + N_CRIT - 1       # 23
R["ps_hdr"] = R["ph_last"] + 1                  # 24  phase-status sub-header
R["ps_first"] = R["ps_hdr"] + 1                 # 25..30
R["ps_last"] = R["ps_first"] + len(PHASES) - 1
R["ph_sum"] = R["ps_last"] + 1                  # 31  overall
_b = R["ph_sum"] + 2
for key in ("rom", "str", "jmp"):
    R[f"{key}_hdr"], R[f"{key}_name"], R[f"{key}_sub"] = _b, _b + 1, _b + 2
    R[f"{key}_first"], R[f"{key}_last"] = _b + 3, _b + 14
    R[f"{key}_latest"], R[f"{key}_date"] = _b + 15, _b + 16
    _b += 18
R["charts"] = _b + 1                            # 88
R["feed_hdr"] = R["charts"] + 19                # 107
R["feed_cols"], R["feed_first"] = R["feed_hdr"] + 1, R["feed_hdr"] + 2
N_LIST = SLOTS * 3                               # 24
R["feed_last"] = R["feed_first"] + N_LIST - 1
R["list_hdr"] = R["feed_last"] + 3
R["list_cols"], R["list_first"] = R["list_hdr"] + 1, R["list_hdr"] + 2
R["list_last"] = R["list_first"] + N_LIST - 1
R["crit_list_first"] = R["feed_first"]          # dropdown list column L, same rows as the slot table
R["crit_list_last"] = R["feed_first"] + 1 + len(GPS_LABELS) + N_LIST - 1

BLOCKS = [("rom", "ROM"), ("str", "Strength"), ("jmp", "Jump / Power")]
DATE_COL, WK_COL = "A", "B"
METRIC_COLS = [(get_column_letter(3 + 3 * k), get_column_letter(4 + 3 * k), get_column_letter(5 + 3 * k)) for k in range(SLOTS)]
NOTES_COL = get_column_letter(3 + 3 * SLOTS)    # AA
LAST_COL = NOTES_COL
# criteria block columns (A..AA = 27)
CC = dict(num="A", phase=("B", "C"), text=("D", "J"), test=("K", "M"), measure="N", op="O", thr="P", cur=("Q", "R"),
          auto="S", ovr="T", met="U", date=("V", "W"), notes=("X", "AA"))
PH_SUM = dict(label=("A", "D"), phase=("E", "J"), clabel=("K", "N"), count=("O", "Q"), status="R", note=("S", "AA"))
DASH = dict(side="$K$5", inj_date="$L$5", rtp_date="$P$5", target="$M$28", chart="$O$28")
TICKS = dict(zip(REGIONS, ["$B$28", "$D$28", "$F$28", "$H$28", "$K$28"]))

EXAMPLE_INJURY_DATE = dt.date(2026, 8, 10)
EXAMPLE = {"Knee": {
    "rom": [(dt.date(2026, 8, 24), [(118, 140), (2, 3), (9.5, 12), (44.5, 47.0)]),
            (dt.date(2026, 9, 21), [(135, 141), (3, 3), (11, 12), (45.5, 47.0)])],
    "str": [(dt.date(2026, 9, 7), [(312, 480), (255, 300), (1210, 1500), (260, 280)]),
            (dt.date(2026, 10, 12), [(395, 490), (281, 305), (1380, 1520), (272, 285)])],
    "jmp": [(dt.date(2026, 10, 12), [(27.5, None), (14.2, 19.0), (128, 160), (None, None), (None, None), (1.62, None), (None, None), (1.85, None)])],
    "overrides": {0: "Y", 1: "Y", 5: "Y"}},
    "Hip": {"rom": [], "jmp": [],
            "str": [(dt.date(2026, 9, 28), [(20.1, 24.0), (29.0, 31.0), (11.2, 12.8), (13.0, 13.1), (25.9, 30.2), (24.1, 27.5), (18.7, 21.9)]),
                    (dt.date(2026, 10, 19), [(22.6, 24.3), (30.4, 31.2), (12.1, 12.9), (13.4, 13.2), (28.1, 30.4), (25.8, 27.6), (20.5, 22.0)])]}}   # criteria row index -> manual Y (phase 1 manual items + gait)


def latest_pair(col, first, last):
    """(value formula, date formula) for the most-recent-by-date numeric entry in a column."""
    rng, dates = f"{col}{first}:{col}{last}", f"${DATE_COL}${first}:${DATE_COL}${last}"
    dmax = f"SUMPRODUCT(MAX(ISNUMBER({rng})*({dates})))"
    idx = f"SUMPRODUCT(MAX(ISNUMBER({rng})*(({dates})={dmax})*(ROW({rng})-ROW({col}${first})+1)))"
    return (f'=IF(COUNT({rng})=0,"",INDEX({rng},{idx}))', f'=IF(OR(COUNT({rng})=0,{dmax}=0),"",{dmax})')


def lsi_formula(cl, cr, r):
    side = f"Dashboard!{DASH['side']}"
    return (f'=IFERROR(IF(OR({cl}{r}="",{cr}{r}=""),"",IF({side}="L",IF({cr}{r}=0,"",{cl}{r}/{cr}{r}),'
            f'IF({side}="R",IF({cl}{r}=0,"",{cr}{r}/{cl}{r}),IF(MAX({cl}{r},{cr}{r})=0,"",MIN({cl}{r},{cr}{r})/MAX({cl}{r},{cr}{r}))))),"")')


# ====================================================================== region tabs
def build_block(ws, key, title, metrics, unit_hint):
    hdr, name_r, sub_r = R[f"{key}_hdr"], R[f"{key}_name"], R[f"{key}_sub"]
    first, last, latest_r, date_r = R[f"{key}_first"], R[f"{key}_last"], R[f"{key}_latest"], R[f"{key}_date"]
    section_header(ws, hdr, f"{title}  —  {unit_hint}", "A", LAST_COL)
    put(ws, f"{DATE_COL}{name_r}", "Date", f=MID_BLUE, fnt=font(True, WHITE), align=CENTER, merge_to=f"{DATE_COL}{sub_r}")
    put(ws, f"{WK_COL}{name_r}", "Wk", f=MID_BLUE, fnt=font(True, WHITE), align=CENTER, merge_to=f"{WK_COL}{sub_r}")
    put(ws, f"{NOTES_COL}{name_r}", "Notes", f=MID_BLUE, fnt=font(True, WHITE), align=CENTER, merge_to=f"{NOTES_COL}{sub_r}")
    for (cl, cr, cs), m in zip(METRIC_COLS, metrics):
        spare = m == SPARE
        put(ws, f"{cl}{name_r}", m, f=INPUT if spare else YELLOW, fnt=font(not spare, GREY_TXT if spare else BLUE, 9 if spare else 10, italic=spare),
            align=CENTER, merge_to=f"{cs}{name_r}")
        labs = ("Score", "—", "—") if m in BILATERAL else ("L", "R", "LSI")
        for col, lab in zip((cl, cr, cs), labs):
            put(ws, f"{col}{sub_r}", lab, f=MID_BLUE, fnt=font(True, WHITE), align=CENTER)
    ws.row_dimensions[name_r].height = 32
    ws.row_dimensions[sub_r].height = 16
    for r in range(first, last + 1):
        put(ws, f"{DATE_COL}{r}", None, f=INPUT, align=CENTER, numfmt="dd/mm/yyyy")
        put(ws, f"{WK_COL}{r}", f'=IF({DATE_COL}{r}="","",IF(Dashboard!{DASH["inj_date"]}="","",INT(({DATE_COL}{r}-Dashboard!{DASH["inj_date"]})/7)+1))',
            f=PALE_BLUE, fnt=font(False, GREY_TXT, 9), align=CENTER)
        put(ws, f"{NOTES_COL}{r}", None, f=INPUT)
        for (cl, cr, cs), m in zip(METRIC_COLS, metrics):
            bil = m in BILATERAL
            put(ws, f"{cl}{r}", None, f=INPUT, align=CENTER)
            put(ws, f"{cr}{r}", None, f=GREY_CELL if bil else INPUT, align=CENTER)
            put(ws, f"{cs}{r}", lsi_formula(cl, cr, r), f=GREY_CELL if bil else PALE_BLUE, align=CENTER, numfmt="0%")
    for cl, cr, cs in METRIC_COLS:
        ratio_cf(ws, f"{cs}{first}:{cs}{latest_r}")
    put(ws, f"{DATE_COL}{latest_r}", "Latest", f=YELLOW, fnt=font(True, BLUE), align=CENTER, merge_to=f"{WK_COL}{latest_r}")
    put(ws, f"{DATE_COL}{date_r}", "Date of latest", f=LIGHT_BLUE, fnt=font(True), align=CENTER, merge_to=f"{WK_COL}{date_r}")
    put(ws, f"{NOTES_COL}{latest_r}", "Auto — most recent entry by date, per column", f=PALE_BLUE, fnt=font(False, GREY_TXT, 9, italic=True))
    put(ws, f"{NOTES_COL}{date_r}", None, f=PALE_BLUE)
    for cl, cr, cs in METRIC_COLS:
        for col in (cl, cr, cs):
            v, _ = latest_pair(col, first, last)
            put(ws, f"{col}{latest_r}", v, f=YELLOW, fnt=font(True, BLUE), align=CENTER, numfmt="0%" if col == cs else "General")
        _, d = latest_pair(cl, first, last)
        put(ws, f"{cl}{date_r}", d, f=PALE_BLUE, align=CENTER, numfmt="dd/mm/yyyy", merge_to=f"{cs}{date_r}")
    ws.row_dimensions[latest_r].height = 18


def build_criteria(ws, name, spec):
    """Structured, live-evaluated exit criteria: 3 rows per phase + phase status + overall."""
    ff, fl = R["feed_first"], R["feed_last"]
    names, latL, latR, latLSI, latD = (f"${c}${ff}:${c}${fl}" for c in ("C", "G", "H", "I", "J"))
    side = f"Dashboard!{DASH['side']}"

    def cur_expr(r):
        T, Mm = f"$K{r}", f"$N{r}"
        m = f"MATCH({T},{names},0)"
        metric = (f'IF({Mm}="LSI",INDEX({latLSI},{m}),IF({Mm}="L",INDEX({latL},{m}),IF({Mm}="R",INDEX({latR},{m}),'
                  f'IF({side}="L",INDEX({latL},{m}),IF({side}="R",INDEX({latR},{m}),"")))))')
        gps = "CHOOSE(MATCH({T},Lists!$G$3:$G$8,0)," + ",".join(f"GPS!$G${6 + i}" for i in range(6)) + ")"
        gps = gps.replace("{T}", T)
        return f'IF(OR({T}="",{T}="{MANUAL}"),"",IF(LEFT({T},4)="GPS:",IFERROR({gps},""),IFERROR({metric},"")))'

    section_header(ws, R["ph_hdr"], "Phase Progression — Exit Criteria (live: pick test · measure · operator · threshold; Override for manual items). LSI / GPS thresholds as decimals (0.9 = 90%).", "A", LAST_COL)
    col_headers(ws, R["ph_cols"], [("#", 1), ("Phase", 2), ("Criterion (edit)", 7), ("Test (dropdown)", 3), ("Measure", 1), ("Op", 1),
                                   ("Threshold", 1), ("Current (auto)", 2), ("Auto result", 1), ("Override (Y/N)", 1), ("Met?", 1),
                                   ("Date met (auto)", 2), ("Notes", 4)], size=9)
    r = R["ph_first"]
    ex_ovr = EXAMPLE.get(name, {}).get("overrides", {})
    for p_i, ph in enumerate(spec.get("phases", PHASES)):
        rows = spec["criteria"][p_i] + [None] * CRIT_PER_PHASE
        put(ws, f"B{r}", ph, f=LIGHT_BLUE, fnt=font(True), align=CENTER, merge_to=f"C{r + CRIT_PER_PHASE - 1}")
        for j in range(CRIT_PER_PHASE):
            rr = r + j
            crit = rows[j]
            text, test, meas, op, thr = crit if crit else ("", "", "", "≥", None)
            if crit and test == MANUAL: meas = ""
            if crit and test != MANUAL and not test.startswith("GPS:") and not meas: meas = "LSI"
            put(ws, f"A{rr}", p_i * CRIT_PER_PHASE + j + 1, f=LIGHT_BLUE, fnt=font(False, GREY_TXT, 9), align=CENTER)
            put(ws, f"D{rr}", text or None, f=INPUT, merge_to=f"J{rr}")
            put(ws, f"K{rr}", test or None, f=INPUT, fnt=font(False, "000000", 9), merge_to=f"M{rr}")
            put(ws, f"N{rr}", meas or None, f=INPUT, align=CENTER)
            put(ws, f"O{rr}", op if crit else "≥", f=INPUT, align=CENTER)
            put(ws, f"P{rr}", thr, f=INPUT, align=CENTER, numfmt="General")
            cur = cur_expr(rr)
            put(ws, f"Q{rr}", f'=IF({cur}="","",IF(OR($N{rr}="LSI",LEFT($K{rr},4)="GPS:"),TEXT({cur},"0%"),TEXT({cur},"0.0")))',
                f=PALE_BLUE, fnt=font(True), align=CENTER, merge_to=f"R{rr}")
            put(ws, f"S{rr}", f'=IF(OR({cur}="",$P{rr}=""),"",IF(IF($O{rr}="≤",{cur}<=$P{rr},{cur}>=$P{rr}),"MET","NOT MET"))',
                f=PALE_BLUE, fnt=font(True, "000000", 9), align=CENTER)
            put(ws, f"T{rr}", ex_ovr.get(p_i * CRIT_PER_PHASE + j), f=INPUT, fnt=font(True), align=CENTER)
            put(ws, f"U{rr}", f'=IF($T{rr}<>"",$T{rr},IF($S{rr}="MET","Y",IF($S{rr}="NOT MET","N","")))', f=PALE_BLUE, fnt=font(True), align=CENTER)
            put(ws, f"V{rr}", f'=IF($U{rr}="Y",IFERROR(IF(LEFT($K{rr},4)="GPS:","",INDEX({latD},MATCH($K{rr},{names},0))),""),"")',
                f=PALE_BLUE, align=CENTER, numfmt="dd/mm/yyyy", merge_to=f"W{rr}")
            put(ws, f"X{rr}", None, f=INPUT, merge_to=f"AA{rr}")
            ws.row_dimensions[rr].height = 18
        r += CRIT_PER_PHASE
    f_, l_ = R["ph_first"], R["ph_last"]
    status_cf(ws, f"S{f_}:S{l_}"); status_cf(ws, f"U{f_}:U{l_}"); status_cf(ws, f"T{f_}:T{l_}")
    for col, lst in (("K", f"=$L${R['crit_list_first']}:$L${R['crit_list_last']}"), ("N", '"LSI,Injured,L,R"'), ("O", '"≥,≤"'), ("T", '"Y,N"')):
        dv = DataValidation(type="list", formula1=lst, allow_blank=True)
        ws.add_data_validation(dv); dv.add(f"{col}{f_}:{col}{l_}")

    # phase status (auto)
    ps = R["ps_hdr"]
    col_headers(ws, ps, [("", 1), ("Phase", 2), ("Criteria met (auto)", 7), ("Cleared?", 3), ("Next outstanding criterion", 14)],
                f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    for p_i, ph in enumerate(spec.get("phases", PHASES)):
        rr = R["ps_first"] + p_i
        a, b = R["ph_first"] + p_i * CRIT_PER_PHASE, R["ph_first"] + (p_i + 1) * CRIT_PER_PHASE - 1
        defined, met = f'COUNTA($D${a}:$D${b})', f'COUNTIFS($D${a}:$D${b},"<>",$U${a}:$U${b},"Y")'
        put(ws, f"A{rr}", p_i + 1, f=PALE_BLUE, fnt=font(False, GREY_TXT, 9), align=CENTER)
        put(ws, f"B{rr}", ph, f=PALE_BLUE, fnt=font(True, "000000", 9), merge_to=f"C{rr}")
        put(ws, f"D{rr}", f'=IF({defined}=0,"No criteria defined",{met}&" / "&{defined})', f=PALE_BLUE, fnt=font(False, "000000", 9), align=CENTER, merge_to=f"J{rr}")
        put(ws, f"K{rr}", f'=IF(AND({defined}>0,{met}={defined}),"Y","N")', f=PALE_BLUE, fnt=font(True), align=CENTER, merge_to=f"M{rr}")
        nxt = f'IF(AND($D${a}<>"",$U${a}<>"Y"),$D${a},IF(AND($D${a + 1}<>"",$U${a + 1}<>"Y"),$D${a + 1},IF(AND($D${a + 2}<>"",$U${a + 2}<>"Y"),$D${a + 2},"")))'
        put(ws, f"N{rr}", f'=IF(K{rr}="Y","—",{nxt})', f=PALE_BLUE, fnt=font(False, GREY_TXT, 9), merge_to=f"AA{rr}")
        ws.row_dimensions[rr].height = 15
    status_cf(ws, f"K{R['ps_first']}:K{R['ps_last']}")
    s = R["ph_sum"]
    kr = f"$K${R['ps_first']}:$K${R['ps_last']}"
    cnt = f'COUNTIF({kr},"Y")'
    put(ws, f"A{s}", "Current phase", f=LIGHT_BLUE, fnt=font(True), merge_to=f"D{s}")
    put(ws, f"E{s}", f'=IFERROR(INDEX($B${R["ps_first"]}:$B${R["ps_last"]},MATCH("N",{kr},0)),"Rehab complete — RTP")',
        f=YELLOW, fnt=font(True, BLUE, 11), align=CENTER, merge_to=f"J{s}")
    put(ws, f"K{s}", "Phases cleared", f=LIGHT_BLUE, fnt=font(True), align=CENTER, merge_to=f"N{s}")
    put(ws, f"O{s}", f'={cnt}&" / 6"', f=PALE_BLUE, fnt=font(True), align=CENTER, merge_to=f"Q{s}")
    put(ws, f"R{s}", f'=IF({cnt}>=6,"COMPLETE",IF({cnt}=0,"NOT STARTED","IN PROGRESS"))', f=PALE_BLUE, fnt=font(True), align=CENTER)
    D_rng, U_rng = f"$D${R['ph_first']}:$D${R['ph_last']}", f"$U${R['ph_first']}:$U${R['ph_last']}"
    pidx = f'MATCH("N",{kr},0)'
    parts = []
    for j in range(1, CRIT_PER_PHASE + 1):
        i = f"(({pidx})-1)*{CRIT_PER_PHASE}+{j}"
        parts.append(f'IF(AND(INDEX({D_rng},{i})<>"",INDEX({U_rng},{i})<>"Y"),INDEX({D_rng},{i}),"")')
    put(ws, f"S{s}", "Open now:", f=LIGHT_BLUE, fnt=font(True, "000000", 9), align=CENTER)
    put(ws, f"T{s}", '=IFERROR(_xlfn.TEXTJOIN("   ·   ",TRUE,' + ",".join(parts) + '),"")',
        f=PALE_BLUE, fnt=font(False, "000000", 9), merge_to=f"AA{s}")
    ws.row_dimensions[s].height = 30
    status_cf(ws, f"R{s}:R{s}")
    ws[f"R{s}"].font = font(True, "000000", 9)


def build_region(name):
    spec = REGION_SPEC[name]
    ws = wb.create_sheet(name)
    ws.sheet_properties.tabColor = BLUE
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 85
    ws.column_dimensions[DATE_COL].width = 13
    ws.column_dimensions[WK_COL].width = 6
    for k in range(SLOTS):
        for col in METRIC_COLS[k]: ws.column_dimensions[col].width = 10
    ws.column_dimensions[NOTES_COL].width = 32

    put(ws, "A1", f"{name.replace('-', ' & ')} — Rehabilitation Testing", f=BLUE, fnt=font(True, WHITE, 16), merge_to=f"{LAST_COL}1")
    ws.row_dimensions[1].height = 28
    put(ws, "A2", spec["focus"], fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to=f"{LAST_COL}2")
    ws.row_dimensions[2].height = 26

    build_criteria(ws, name, spec)
    build_block(ws, "rom", "Range of Motion", spec["rom"], "degrees / cm as labelled")
    build_block(ws, "str", spec["str_title"], spec["str"], "L / R values as labelled")
    build_block(ws, "jmp", spec["jmp_title"], spec["jmp"], "force plate / tape / timing gates")

    ex = EXAMPLE.get(name)
    if ex:
        for key in ("rom", "str", "jmp"):
            for i, (d, vals) in enumerate(ex[key]):
                r = R[f"{key}_first"] + i
                ws[f"{DATE_COL}{r}"] = d
                for (cl, cr, _), (vl, vr) in zip(METRIC_COLS, vals):
                    if vl is not None: ws[f"{cl}{r}"] = vl
                    if vr is not None: ws[f"{cr}{r}"] = vr
                ws[f"{NOTES_COL}{r}"] = "EXAMPLE ROW — overwrite / delete"
                ws[f"{NOTES_COL}{r}"].font = font(False, GREY_TXT, 9, italic=True)

    # charts: slot 1 of each block vs rehab week
    rc = R["charts"]
    put(ws, f"A{rc - 1}", "Progression — slot 1 of each block against rehab week (L vs R, or score for bilateral tests). "
                          "Right-click > Select Data to point at another metric; the Dashboard shows LSI-over-time for every slot in use.",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to=f"{LAST_COL}{rc - 1}")
    for (key, label), anchor_col in zip(BLOCKS, ("A", "K", "T")):
        first, last, sub_r = R[f"{key}_first"], R[f"{key}_last"], R[f"{key}_sub"]
        cl, cr, _ = METRIC_COLS[0]
        x = Reference(ws, range_string=f"{q(name)}!${WK_COL}${first}:${WK_COL}${last}")
        bil = spec[key][0] in BILATERAL
        series = [(Reference(ws, range_string=f"{q(name)}!${cl}${first}:${cl}${last}"), f"{q(name)}!${cl}${sub_r}")]
        if not bil:
            series.append((Reference(ws, range_string=f"{q(name)}!${cr}${first}:${cr}${last}"), f"{q(name)}!${cr}${sub_r}"))
        scatter_chart(ws, f"{anchor_col}{rc}", f"{label}: {spec[key][0]}" + ("" if bil else " — L vs R"), x, series,
                      y_title=spec[key][0], width=13.5, height=7.5, legend=not bil)

    # dashboard feed (slot table + compacted list) and the criteria dropdown list
    fh, fc, ff, fl = R["feed_hdr"], R["feed_cols"], R["feed_first"], R["feed_last"]
    section_header(ws, fh, "Dashboard feed (auto) — slots in use on this tab. Do not edit; rename slot headers above instead.", "A", "J")
    col_headers(ws, fc, [("Slot", 1), ("Block", 1), ("Test", 2), ("In use?", 1), ("Run #", 1), ("Latest L", 1), ("Latest R", 1), ("Latest LSI", 1), ("Date", 1), ("Δ vs prev", 1)],
                f=LIGHT_BLUE, color=BLUE, size=9, height=18)
    g9 = font(False, GREY_TXT, 9)
    row = ff
    for key, label in BLOCKS:
        name_r, latest_r, date_r = R[f"{key}_name"], R[f"{key}_latest"], R[f"{key}_date"]
        bf, bl = R[f"{key}_first"], R[f"{key}_last"]
        for k_, (cl, cr, cs) in enumerate(METRIC_COLS):
            bil = spec[key][k_] in BILATERAL
            mc = cl if bil else cs
            rng, dts = f"${mc}${bf}:${mc}${bl}", f"$A${bf}:$A${bl}"
            d2 = f"SUMPRODUCT(LARGE(ISNUMBER({rng})*({dts}),2))"
            prev = f"INDEX({rng},SUMPRODUCT(MAX(ISNUMBER({rng})*(({dts})={d2})*(ROW({rng})-ROW(${mc}${bf})+1))))"
            lat = f"{mc}{latest_r}"
            delta = (f'=IFERROR(IF(COUNT({rng})<2,"",' +
                     (f'TEXT({lat}-{prev},"+0.0;-0.0;0.0")' if bil else f'TEXT(({lat}-{prev})*100,"+0;-0;0")&" pts"') + '),"")')
            put(ws, f"K{row}", delta, f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"A{row}", row - ff + 1, f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"B{row}", label, f=PALE_BLUE, fnt=g9)
            put(ws, f"C{row}", f"={cl}{name_r}", f=PALE_BLUE, fnt=g9, merge_to=f"D{row}")
            put(ws, f"E{row}", f'=AND(C{row}<>"",LEFT(C{row},1)<>"(")', f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"F{row}", f'=IF(E{row},COUNTIF($E${ff}:E{row},TRUE),"")', f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"G{row}", f"={cl}{latest_r}", f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"H{row}", f"={cr}{latest_r}", f=PALE_BLUE, fnt=g9, align=CENTER)
            put(ws, f"I{row}", f"={cs}{latest_r}", f=PALE_BLUE, fnt=g9, align=CENTER, numfmt="0%")
            put(ws, f"J{row}", f"={cl}{date_r}", f=PALE_BLUE, fnt=g9, align=CENTER, numfmt="dd/mm/yyyy")
            ws.row_dimensions[row].height = 14
            row += 1
    # criteria dropdown list (col L): Manual, GPS items, then every slot name
    put(ws, f"L{fc}", "Criteria test list (auto)", f=LIGHT_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
    ws.column_dimensions["L"].width = 10  # (overrides the metric width set above — L is also a metric column; keep 10)
    items = [MANUAL] + GPS_LABELS
    for i, it in enumerate(items):
        put(ws, f"L{ff + i}", it, f=PALE_BLUE, fnt=g9)
    for k in range(N_LIST):
        put(ws, f"L{ff + len(items) + k}", f"=C{ff + k}", f=PALE_BLUE, fnt=g9)
    lh, lc, lf = R["list_hdr"], R["list_cols"], R["list_first"]
    section_header(ws, lh, "Compacted list (auto) — what the Dashboard shows for this tab", "A", "J")
    col_headers(ws, lc, [("#", 1), ("Block", 1), ("Test", 2), ("L", 1), ("R", 1), ("LSI", 1), ("Date", 1), ("Block label", 2), ("Δ", 1)], f=LIGHT_BLUE, color=BLUE, size=9, height=18)
    for k in range(1, N_LIST + 1):
        r = lf + k - 1
        m = f"MATCH({k},$F${ff}:$F${fl},0)"
        put(ws, f"A{r}", k, f=PALE_BLUE, fnt=g9, align=CENTER)
        put(ws, f"B{r}", f'=IFERROR(INDEX($B${ff}:$B${fl},{m}),"")', f=PALE_BLUE, fnt=g9)
        put(ws, f"C{r}", f'=IFERROR(INDEX($C${ff}:$C${fl},{m}),"")', f=PALE_BLUE, fnt=g9, merge_to=f"D{r}")
        put(ws, f"E{r}", f'=IFERROR(INDEX($G${ff}:$G${fl},{m}),"")', f=PALE_BLUE, fnt=g9, align=CENTER)
        put(ws, f"F{r}", f'=IFERROR(INDEX($H${ff}:$H${fl},{m}),"")', f=PALE_BLUE, fnt=g9, align=CENTER)
        put(ws, f"G{r}", f'=IFERROR(INDEX($I${ff}:$I${fl},{m}),"")', f=PALE_BLUE, fnt=g9, align=CENTER, numfmt="0%")
        put(ws, f"H{r}", f'=IFERROR(INDEX($J${ff}:$J${fl},{m}),"")', f=PALE_BLUE, fnt=g9, align=CENTER, numfmt="dd/mm/yyyy")
        prev = f"B{r - 1}" if k > 1 else '""'
        put(ws, f"I{r}", f'=IF(B{r}="","",IF(B{r}={prev},"",B{r}))', f=PALE_BLUE, fnt=g9, merge_to=f"J{r}")
        put(ws, f"K{r}", f'=IFERROR(INDEX($K${ff}:$K${fl},{m}),"")', f=PALE_BLUE, fnt=g9, align=CENTER)
        ws.row_dimensions[r].height = 14
    ws.freeze_panes = None
    return ws


# ====================================================================== GPS (unchanged logic)
G = dict(crit_hdr=4, crit_cols=5, crit_first=6, crit_last=11, crit_sum=12, base_hdr=14, base_cols=15, base_row=16,
         wk_hdr=18, wk_cols=19, wk_first=20, wk_last=71, log_hdr=74, log_cols=75, log_first=76, log_last=375)
GPS_METRICS = [("TD (m)", "C"), ("HSR (m)", "D"), ("SD (m)", "E"), ("Acc (#)", "F"), ("Dec (#)", "G"), ("Top Speed (m/s)", "H")]


def build_gps():
    ws = wb.create_sheet("GPS")
    ws.sheet_properties.tabColor = MID_BLUE
    ws.sheet_view.zoomScale = 90
    for c, w in {"A": 13, "B": 10, "C": 14, "D": 12, "E": 12, "F": 11, "G": 11, "H": 13, "I": 13, "J": 13, "K": 13}.items():
        ws.column_dimensions[c].width = w
    wf, wl, lf, ll, br = G["wk_first"], G["wk_last"], G["log_first"], G["log_last"], G["base_row"]
    put(ws, "A1", "GPS — Pitch Load & Return-to-Sport Metrics", f=BLUE, fnt=font(True, WHITE, 16), merge_to="K1")
    ws.row_dimensions[1].height = 28
    put(ws, "A2", "Log every pitch session in the Session Log (bottom). Week # auto-fills from the injury/surgery date on the Dashboard. "
                  "Weekly totals, % baseline, charts, the Dashboard and any GPS-based exit criteria update automatically. Speeds in m/s (km/h ÷ 3.6).",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="K2")
    ws.row_dimensions[2].height = 30
    section_header(ws, G["crit_hdr"], "Return-to-Sport GPS Criteria", "A", "K")
    col_headers(ws, G["crit_cols"], [("#", 1), ("Outcome measure", 2), ("Goal", 2), ("Achieved? (Y/N)", 1), ("Best week vs baseline (auto)", 3), ("Date met", 1), ("Notes", 1)])
    crit = [("Total Distance — % of baseline", "≥ 100% baseline", "C"), ("HSR (m) — % of baseline", "≥ 100% baseline", "D"),
            ("Sprint Distance (m) — % of baseline", "≥ 95% baseline", "E"), ("Accelerations — % of baseline", "≥ 95% baseline", "F"),
            ("Decelerations — % of baseline", "≥ 95% baseline", "G"), ("Top Speed (m/s) — % of baseline", "≥ 95% baseline", "H")]
    for i, (m, goal, col) in enumerate(crit):
        r = G["crit_first"] + i
        put(ws, f"A{r}", i + 1, f=LIGHT_BLUE, fnt=font(True), align=CENTER)
        put(ws, f"B{r}", m, f=LIGHT_BLUE, fnt=font(True), merge_to=f"C{r}")
        put(ws, f"D{r}", goal, f=INPUT, align=CENTER, merge_to=f"E{r}")
        put(ws, f"F{r}", None, f=INPUT, fnt=font(True), align=CENTER)
        put(ws, f"G{r}", f'=IF(OR({col}{br}="",COUNT({col}{wf}:{col}{wl})=0),"",MAX({col}{wf}:{col}{wl})/{col}{br})', f=PALE_BLUE, align=CENTER, numfmt="0%", merge_to=f"I{r}")
        put(ws, f"J{r}", None, f=INPUT, align=CENTER, numfmt="dd/mm/yyyy")
        put(ws, f"K{r}", None, f=INPUT)
    cf_, cl_, s = G["crit_first"], G["crit_last"], G["crit_sum"]
    put(ws, f"A{s}", "Ready for Return to Sport (GPS)?", f=LIGHT_BLUE, fnt=font(True), merge_to=f"E{s}")
    put(ws, f"F{s}", f'=COUNTIF(F{cf_}:F{cl_},"Y")&" / 6"', f=PALE_BLUE, fnt=font(True), align=CENTER)
    put(ws, f"G{s}", f'=IF(COUNTIF(F{cf_}:F{cl_},"Y")=6,"READY",IF(COUNTIF(F{cf_}:F{cl_},"Y")=0,"NOT READY","IN PROGRESS"))', f=PALE_BLUE, fnt=font(True), align=CENTER, merge_to=f"I{s}")
    put(ws, f"J{s}", None, f=PALE_BLUE, merge_to=f"K{s}")
    status_cf(ws, f"G{s}:G{s}"); status_cf(ws, f"F{cf_}:F{cl_}"); ratio_cf(ws, f"G{cf_}:G{cl_}", "1", "0.8")
    dv = DataValidation(type="list", formula1='"Y,N"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"F{cf_}:F{cl_}")
    section_header(ws, G["base_hdr"], "Pre-Injury Baseline (typical weekly load — the target the Dashboard compares against)", "A", "K")
    col_headers(ws, G["base_cols"], [("Date range / source", 2)] + [(m, 1) for m, _ in GPS_METRICS] + [("Notes", 3)])
    put(ws, f"A{br}", "e.g. 4-wk pre-injury avg", f=INPUT, merge_to=f"B{br}")
    for (m, col), v in zip(GPS_METRICS, [20000, 800, 300, 80, 80, 8.9]):
        put(ws, f"{col}{br}", v, f=INPUT, align=CENTER, numfmt="#,##0" if col in "CDE" else ("0.0" if col == "H" else "0"))
    put(ws, f"I{br}", "EXAMPLE values — replace with the player's own baseline", f=INPUT, fnt=font(False, GREY_TXT, 9, italic=True), merge_to=f"K{br}")
    ws[f"C{br}"].comment = Comment("Placeholder baseline (approx. academy weekly load). Replace with the player's own pre-injury averages.", "Dashboard")
    section_header(ws, G["wk_hdr"], "Weekly Totals — auto-calculated from the Session Log (52 weeks)", "A", "K")
    col_headers(ws, G["wk_cols"], [("Week #", 1), ("# Sessions", 1)] + [(m, 1) for m, _ in GPS_METRICS] + [("% Baseline TD", 1), ("% Baseline HSR", 1), ("% Baseline SD", 1)])
    for i in range(52):
        r = wf + i
        put(ws, f"A{r}", i + 1, f=LIGHT_BLUE, fnt=font(True), align=CENTER)
        put(ws, f"B{r}", f"=COUNTIFS($B${lf}:$B${ll},$A{r})", f=PALE_BLUE, align=CENTER)
        for m, col in GPS_METRICS:
            logcol = get_column_letter(ord(col) - 64 + 1)
            if col == "H":
                fml = f'=IFERROR(IF(B{r}=0,"",SUMPRODUCT(MAX(($B${lf}:$B${ll}=$A{r})*(${logcol}${lf}:${logcol}${ll})))),"")'; nf = "0.0"
            else:
                fml = f'=IF(B{r}=0,"",SUMIFS(${logcol}${lf}:${logcol}${ll},$B${lf}:$B${ll},$A{r}))'; nf = "#,##0"
            put(ws, f"{col}{r}", fml, f=PALE_BLUE, align=CENTER, numfmt=nf)
        for pc, src in (("I", "C"), ("J", "D"), ("K", "E")):
            put(ws, f"{pc}{r}", f'=IFERROR(IF({src}{r}="","",{src}{r}/${src}${br}),"")', f=PALE_BLUE, align=CENTER, numfmt="0%")
    ratio_cf(ws, f"I{wf}:K{wl}", "1", "0.8")
    section_header(ws, G["log_hdr"], "Session Log — one row per pitch session (300 rows)", "A", "K")
    col_headers(ws, G["log_cols"], [("Date", 1), ("Week # (auto)", 1), ("Session type", 1)] + [(m, 1) for m, _ in GPS_METRICS] + [("Notes", 2)])
    for r in range(lf, ll + 1):
        put(ws, f"A{r}", None, f=INPUT, align=CENTER, numfmt="dd/mm/yyyy")
        put(ws, f"B{r}", f'=IF(A{r}="","",IF(Dashboard!{DASH["inj_date"]}="","",INT((A{r}-Dashboard!{DASH["inj_date"]})/7)+1))', f=PALE_BLUE, align=CENTER)
        put(ws, f"C{r}", None, f=INPUT, align=CENTER)
        for m, col in GPS_METRICS:
            logcol = get_column_letter(ord(col) - 64 + 1)
            put(ws, f"{logcol}{r}", None, f=INPUT, align=CENTER, numfmt="0.0" if logcol == "I" else "General")
        put(ws, f"J{r}", None, f=INPUT, merge_to=f"K{r}")
    dv2 = DataValidation(type="list", formula1="=Lists!$D$3:$D$7", allow_blank=True); ws.add_data_validation(dv2); dv2.add(f"C{lf}:C{ll}")
    ws.freeze_panes = f"A{lf}"
    for i, row in enumerate([(dt.date(2026, 10, 13), "Training", 4850, 210, 45, 22, 19, 7.4),
                             (dt.date(2026, 10, 15), "Training", 5620, 265, 80, 25, 23, 7.9),
                             (dt.date(2026, 10, 19), "Rehab", 3900, 140, 30, 15, 14, 7.1)]):
        r = lf + i
        ws[f"A{r}"] = row[0]; ws[f"C{r}"] = row[1]
        for logcol, v in zip("DEFGHI", row[2:]): ws[f"{logcol}{r}"] = v
        ws[f"J{r}"] = "EXAMPLE ROW — overwrite / delete"; ws[f"J{r}"].font = font(False, GREY_TXT, 9, italic=True)
    return ws


# ====================================================================== Lists
def build_lists():
    ws = wb.create_sheet("Lists")
    ws.sheet_properties.tabColor = "A6A6A6"
    for c, w in {"A": 14, "B": 4, "C": 8, "D": 14, "E": 26, "F": 4, "G": 36}.items(): ws.column_dimensions[c].width = w
    put(ws, "A1", "Dropdown sources. Add to the lists; don't delete columns. Column G labels drive GPS-based exit criteria (keep the wording).",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="G1")
    col_headers(ws, 2, [("Region", 1)], start_col=1); col_headers(ws, 2, [("Y / N", 1)], start_col=3)
    col_headers(ws, 2, [("Session type", 1)], start_col=4); col_headers(ws, 2, [("Phase", 1)], start_col=5)
    col_headers(ws, 2, [("GPS criteria labels", 1)], start_col=7)
    for i, r in enumerate(REGIONS): put(ws, f"A{3 + i}", r, f=INPUT)
    put(ws, "C3", "Y", f=INPUT, align=CENTER); put(ws, "C4", "N", f=INPUT, align=CENTER)
    for i, s in enumerate(["Rehab", "Training", "Match", "Individual", "Other"]): put(ws, f"D{3 + i}", s, f=INPUT)
    for i, p in enumerate(PHASES): put(ws, f"E{3 + i}", p, f=INPUT)
    for i, g in enumerate(GPS_LABELS): put(ws, f"G{3 + i}", g, f=PALE_BLUE)
    return ws


# ====================================================================== Chart Feed
def pick(cell_ref):
    parts = ",".join(f"{q(r)}!{cell_ref}" for r in REGIONS)
    return f"CHOOSE(MATCH(Dashboard!{DASH['region']},Lists!$A$3:$A$6,0),{parts})"


CF = dict(rom_hdr=3, str_hdr=18, jmp_hdr=33, gps_hdr=48)


def build_chart_feed():
    ws = wb.create_sheet("Chart Feed")
    ws.sheet_properties.tabColor = "A6A6A6"
    ws.column_dimensions["A"].width = 12
    for k in range(SLOTS): ws.column_dimensions[get_column_letter(2 + k)].width = 13
    put(ws, "A1", "Chart feed (auto) — mirrors the selected region for the Dashboard charts, by rehab week. #N/A is deliberate: it is how Excel "
                  "leaves a gap in a chart instead of plotting an empty cell as zero. Nothing to edit here.",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="I1")
    ws.row_dimensions[1].height = 28
    for (key, label) in BLOCKS:
        h = CF[f"{key}_hdr"]
        name_r, sub_r, first = R[f"{key}_name"], R[f"{key}_sub"], R[f"{key}_first"]
        section_header(ws, h, f"{label} — LSI by rehab week (selected region)", "A", get_column_letter(1 + SLOTS))
        put(ws, f"A{h + 1}", "Rehab wk", f=LIGHT_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
        for k, (cl, cr, cs) in enumerate(METRIC_COLS):
            col = get_column_letter(2 + k)
            put(ws, f"{col}{h + 1}", f'=IF(OR(LEFT({pick(f"${cl}${name_r}")},1)="(",{pick(f"${cl}${sub_r}")}="Score")," ",{pick(f"${cl}${name_r}")})',
                f=LIGHT_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
            for i in range(12):
                r, src = h + 2 + i, first + i
                put(ws, f"{col}{r}", f'=IF(ISNUMBER({pick(f"${cs}${src}")}),{pick(f"${cs}${src}")},NA())', fnt=font(False, GREY_TXT, 9), align=CENTER, numfmt="0%", border=BOTTOM)
        for i in range(12):
            r, src = h + 2 + i, first + i
            put(ws, f"A{r}", f'=IF({pick(f"${WK_COL}${src}")}="","",{pick(f"${WK_COL}${src}")})', fnt=font(False, GREY_TXT, 9), align=CENTER, border=BOTTOM)
        ws.conditional_formatting.add(f"B{h + 2}:{get_column_letter(1 + SLOTS)}{h + 13}", FormulaRule(formula=[f"ISNA(B{h + 2})"], font=Font(name=FONT_NAME, color="C8C8C8", size=9)))
    h = CF["gps_hdr"]; wf, wl = G["wk_first"], G["wk_last"]
    section_header(ws, h, "GPS — weekly totals up to the latest logged week", "A", "F")
    latest = f"SUMPRODUCT(MAX((GPS!$B${wf}:$B${wl}>0)*GPS!$A${wf}:$A${wl}))"
    put(ws, f"G{h + 1}", "Latest logged wk", f=LIGHT_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
    put(ws, f"H{h + 1}", f"={latest}", f=PALE_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
    for col, lab in zip("ABCDEF", ["Week #", "TD (m)", "HSR (m)", "SD (m)", "Acc (#)", "Top Speed (m/s)"]):
        put(ws, f"{col}{h + 1}", lab, f=LIGHT_BLUE, fnt=font(True, BLUE, 9), align=CENTER)
    for i in range(52):
        r, g = h + 2 + i, wf + i
        put(ws, f"A{r}", f"=GPS!A{g}", fnt=font(False, GREY_TXT, 9), align=CENTER, border=BOTTOM)
        for col, gcol, zero in (("B", "C", "0"), ("C", "D", "0"), ("D", "E", "0"), ("E", "F", "0"), ("F", "H", "NA()")):
            put(ws, f"{col}{r}", f'=IF(GPS!$A{g}>$H${h + 1},NA(),IF(GPS!$B{g}=0,{zero},GPS!{gcol}{g}))', fnt=font(False, GREY_TXT, 9), align=CENTER,
                numfmt="0.0" if col == "F" else "#,##0", border=BOTTOM)
    ws.conditional_formatting.add(f"B{h + 2}:F{h + 53}", FormulaRule(formula=[f"ISNA(B{h + 2})"], font=Font(name=FONT_NAME, color="C8C8C8", size=9)))
    return ws


def add_gps_charts():
    ws, feed = wb["GPS"], wb["Chart Feed"]
    gh = CF["gps_hdr"]
    cats = Reference(feed, range_string=f"'Chart Feed'!$A${gh + 2}:$A${gh + 53}")
    def ref(col): return Reference(feed, range_string=f"'Chart Feed'!${col}${gh + 2}:${col}${gh + 53}")
    put(ws, f"M{G['wk_hdr'] - 1}", "Weekly charts (lines stop at the latest logged week; a week with no sessions plots as 0).", fnt=font(False, GREY_TXT, 9, italic=True), border=None)
    line_chart(ws, f"M{G['wk_hdr']}", "Weekly total distance (m)", cats, [(ref("B"), f"'Chart Feed'!$B${gh + 1}")], "metres", width=15.5, height=7.5, legend=False, x_title="Rehab week")
    line_chart(ws, f"M{G['wk_hdr'] + 17}", "Weekly HSR & sprint distance (m)", cats, [(ref("C"), f"'Chart Feed'!$C${gh + 1}"), (ref("D"), f"'Chart Feed'!$D${gh + 1}")], "metres", width=15.5, height=7.5, x_title="Rehab week")
    line_chart(ws, f"M{G['wk_hdr'] + 34}", "Weekly top speed (m/s)", cats, [(ref("F"), f"'Chart Feed'!$F${gh + 1}")], "m/s", width=15.5, height=7.5, legend=False, x_title="Rehab week")


# ====================================================================== Dashboard
def build_dashboard():
    ws = wb.active
    ws.title = "Dashboard"
    ws.sheet_properties.tabColor = YELLOW
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 90
    for c, w in {"A": 2, "B": 10, "C": 13, "D": 13, "E": 8, "F": 8, "G": 8, "H": 11, "I": 3, "J": 20, "K": 10, "L": 10, "M": 10, "N": 10, "O": 10, "P": 10, "Q": 2}.items():
        ws.column_dimensions[c].width = w
    feed = wb["Chart Feed"]
    put(ws, "B1", "Rehabilitation Testing Dashboard", f=BLUE, fnt=font(True, WHITE, 18), merge_to="P1")
    ws.row_dimensions[1].height = 34
    put(ws, "B2", None, f=YELLOW, merge_to="P2"); ws.row_dimensions[2].height = 5
    ws.row_dimensions[3].height = 10

    def tile(label_row, c1, c2, label, value, *, is_input, numfmt="General", big=False, align=CENTER, color=None):
        put(ws, f"{c1}{label_row}", label.upper(), fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(horizontal="left", vertical="bottom"),
            merge_to=f"{c2}{label_row}" if c2 != c1 else None)
        put(ws, f"{c1}{label_row + 1}", value, f=INPUT if is_input else PALE_BLUE, fnt=font(True, color or (BLUE if not is_input else "000000"), 14 if big else 11),
            align=align, numfmt=numfmt, merge_to=f"{c2}{label_row + 1}" if c2 != c1 else None)

    tile(4, "B", "D", "Player", "Example Player", is_input=True, align=LEFT)
    tile(4, "E", "G", "Injury / surgery", "e.g. R ACL reconstruction", is_input=True, align=LEFT)
    tile(4, "H", "H", "Injured side", "L", is_input=True)
    tile(4, "J", "J", "Body region", "Knee", is_input=True)
    tile(4, "K", "L", "Injury / surgery date", EXAMPLE_INJURY_DATE, is_input=True, numfmt="dd/mm/yyyy")
    tile(4, "M", "N", "Expected RTP", dt.date(2027, 2, 1), is_input=True, numfmt="dd/mm/yyyy")
    tile(4, "O", "P", "Week of rehab", f'=IF({DASH["inj_date"]}="","",INT((TODAY()-{DASH["inj_date"]})/7)+1)', is_input=False, big=True)
    ws["O5"].fill = fill(YELLOW); ws["P5"].fill = fill(YELLOW)
    ws["E5"].font = font(False, GREY_TXT, 10, italic=True)
    ws.row_dimensions[4].height = 13; ws.row_dimensions[5].height = 26; ws.row_dimensions[6].height = 8
    ph = PH_SUM
    tile(7, "B", "D", "Current phase", f'=IFERROR({pick(f"${ph["phase"][0]}${R["ph_sum"]}")},"")', is_input=False)
    tile(7, "E", "H", "Phases cleared", f'=IFERROR({pick(f"${ph["count"][0]}${R["ph_sum"]}")}&"   ·   "&{pick(f"${ph["status"]}${R["ph_sum"]}")},"")', is_input=False)
    tile(7, "J", "J", "Weeks to RTP", f'=IF({DASH["rtp_date"]}="","",ROUND(({DASH["rtp_date"]}-TODAY())/7,1))', is_input=False)
    tile(7, "K", "L", "LSI target", 0.9, is_input=True, numfmt="0%")
    tile(7, "M", "P", "GPS return-to-sport criteria", f'=GPS!F{G["crit_sum"]}&"   ·   "&GPS!G{G["crit_sum"]}', is_input=False)
    ws.row_dimensions[7].height = 13; ws.row_dimensions[8].height = 24; ws.row_dimensions[9].height = 12
    put(ws, "B9", f'=IF({DASH["inj_date"]}="","",(TODAY()-{DASH["inj_date"]})&" days post injury / surgery   ·   LSI = injured ÷ uninjured side ("&IF({DASH["side"]}="","side not set — using MIN/MAX",{DASH["side"]}&" injured")&")")',
        fnt=font(False, GREY_TXT, 8, italic=True), border=None, merge_to="P9")
    for cell, pats in (("E8", [("IN PROGRESS", WARN_FILL, WARN_FONT), ("COMPLETE", GOOD_FILL, GOOD_FONT), ("NOT STARTED", BAD_FILL, BAD_FONT)]),
                       ("M8", [("NOT READY", BAD_FILL, BAD_FONT), ("IN PROGRESS", WARN_FILL, WARN_FONT)])):
        for pat, fl_, fc_ in pats:
            ws.conditional_formatting.add(f"{cell}:{cell}", FormulaRule(formula=[f'ISNUMBER(SEARCH("{pat}",{cell}))'], fill=fill(fl_), font=Font(name=FONT_NAME, bold=True, color=fc_)))
    ws.conditional_formatting.add("M8:M8", FormulaRule(formula=['AND(ISNUMBER(SEARCH("READY",M8)),NOT(ISNUMBER(SEARCH("NOT",M8))))'], fill=fill(GOOD_FILL), font=Font(name=FONT_NAME, bold=True, color=GOOD_FONT)))
    dv = DataValidation(type="list", formula1="=Lists!$A$3:$A$6", allow_blank=False); ws.add_data_validation(dv); dv.add("J5")
    dv_side = DataValidation(type="list", formula1='"L,R"', allow_blank=True); ws.add_data_validation(dv_side); dv_side.add("H5")

    # latest tests list
    light_title(ws, 11, f'="Latest tests  —  "&{DASH["region"]}', "B", "H")
    col_headers(ws, 12, [("Block", 1), ("Test", 2), ("L / score", 1), ("R", 1), ("LSI", 1), ("Date", 1)], start_col=2, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    lf = R["list_first"]
    for k in range(N_LIST):
        r, src = 13 + k, lf + k
        put(ws, f"B{r}", f'=IFERROR({pick(f"$I${src}")},"")', fnt=font(True, GREY_TXT, 8), border=BOTTOM, align=Alignment(vertical="center"))
        put(ws, f"C{r}", f'=IFERROR({pick(f"$C${src}")},"")', fnt=font(False, "000000", 9), border=BOTTOM, merge_to=f"D{r}")
        put(ws, f"E{r}", f'=IFERROR({pick(f"$E${src}")},"")', fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER)
        put(ws, f"F{r}", f'=IFERROR({pick(f"$F${src}")},"")', fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER)
        put(ws, f"G{r}", f'=IFERROR({pick(f"$G${src}")},"")', fnt=font(True, "000000", 9), border=BOTTOM, align=CENTER, numfmt="0%")
        put(ws, f"H{r}", f'=IFERROR({pick(f"$H${src}")},"")', fnt=font(False, GREY_TXT, 9), border=BOTTOM, align=CENTER, numfmt="dd/mm/yy")
        ws.row_dimensions[r].height = 15
    ratio_cf(ws, f"G13:G{12 + N_LIST}", good=DASH["target"], warn=f"({DASH['target']}-0.1)")

    # GPS block
    light_title(ws, 11, "GPS  —  weekly pitch load", "J", "P")
    col_headers(ws, 12, [("", 1)] + [(m, 1) for m, _ in GPS_METRICS], start_col=10, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    wf, wl, br = G["wk_first"], G["wk_last"], G["base_row"]
    latest_cell = f"'Chart Feed'!$H${CF['gps_hdr'] + 1}"
    gps_rows = [("Pre-injury baseline", lambda c: f'=IF(GPS!{c}{br}="","",GPS!{c}{br})'),
                (f'="Latest week"&IF({latest_cell}=0,""," (wk "&{latest_cell}&")")', lambda c: f'=IFERROR(IF(INDEX(GPS!{c}${wf}:{c}${wl},{latest_cell})="","",INDEX(GPS!{c}${wf}:{c}${wl},{latest_cell})),"")'),
                ("% of baseline", None),
                ("Best week to date", lambda c: f'=IF(COUNT(GPS!{c}${wf}:{c}${wl})=0,"",MAX(GPS!{c}${wf}:{c}${wl}))')]
    for i, (label, fml) in enumerate(gps_rows):
        r = 13 + i
        put(ws, f"J{r}", label, fnt=font(True, GREY_TXT, 9), border=BOTTOM)
        for (m, gcol), dc in zip(GPS_METRICS, ["K", "L", "M", "N", "O", "P"]):
            nf = "0.0" if gcol == "H" else "#,##0"
            if fml: put(ws, f"{dc}{r}", fml(gcol), fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER, numfmt=nf)
            else: put(ws, f"{dc}{r}", f'=IFERROR(IF(OR({dc}14="",{dc}13=""),"",{dc}14/{dc}13),"")', fnt=font(True, "000000", 9), border=BOTTOM, align=CENTER, numfmt="0%")
        ws.row_dimensions[r].height = 16
    ratio_cf(ws, "K15:P15", "1", "0.8")
    put(ws, "J17", "Speeds in m/s. Full criteria, baseline and the session log live on the GPS tab.", fnt=font(False, GREY_TXT, 8, italic=True), border=None, merge_to="P17")
    gh = CF["gps_hdr"]
    cats = Reference(feed, range_string=f"'Chart Feed'!$A${gh + 2}:$A${gh + 53}")
    line_chart(ws, "J19", "Weekly total distance (m)", cats, [(Reference(feed, range_string=f"'Chart Feed'!$B${gh + 2}:$B${gh + 53}"), f"'Chart Feed'!$B${gh + 1}")],
               "metres", width=15.0, height=6.6, legend=False, x_title="Rehab week")

    # progression charts (XY by rehab week)
    light_title(ws, 39, f'="Progression  —  LSI by rehab week  —  "&{DASH["region"]}&"   (target "&TEXT({DASH["target"]},"0%")&")"', "B", "P")
    for (key, label), anchor in zip(BLOCKS, ("B41", "G41", "L41")):
        h = CF[f"{key}_hdr"]
        x = Reference(feed, range_string=f"'Chart Feed'!$A${h + 2}:$A${h + 13}")
        series = [(Reference(feed, range_string=f"'Chart Feed'!${get_column_letter(2 + k)}${h + 2}:${get_column_letter(2 + k)}${h + 13}"),
                   f"'Chart Feed'!${get_column_letter(2 + k)}${h + 1}") for k in range(SLOTS)]
        scatter_chart(ws, anchor, f"{label} — LSI", x, series, "LSI", width=9.4, height=10.0, y_fmt="0%", y_min=0.4)
    ws.row_dimensions[40].height = 6

    FT = 63
    light_title(ws, FT, "All regions at a glance", "B", "H")
    col_headers(ws, FT + 1, [("Region", 1), ("Current phase", 2), ("Cleared", 1), ("Status", 2), ("Last test", 1)], start_col=2, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    rf, rl, sf, sl, jf, jl = R["rom_first"], R["rom_last"], R["str_first"], R["str_last"], R["jmp_first"], R["jmp_last"]
    for i, reg in enumerate(REGIONS):
        r, qs = FT + 2 + i, q(reg)
        put(ws, f"B{r}", reg, fnt=font(True, "000000", 9), border=BOTTOM)
        put(ws, f"C{r}", f"={qs}!${PH_SUM['phase'][0]}${R['ph_sum']}", fnt=font(False, "000000", 9), border=BOTTOM, merge_to=f"D{r}")
        put(ws, f"E{r}", f"={qs}!${PH_SUM['count'][0]}${R['ph_sum']}", fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER)
        put(ws, f"F{r}", f"={qs}!${PH_SUM['status']}${R['ph_sum']}", fnt=font(True, "000000", 9), border=BOTTOM, align=CENTER, merge_to=f"G{r}")
        put(ws, f"H{r}", f'=IF(COUNT({qs}!$A${rf}:$A${rl},{qs}!$A${sf}:$A${sl},{qs}!$A${jf}:$A${jl})=0,"",MAX({qs}!$A${rf}:$A${rl},{qs}!$A${sf}:$A${sl},{qs}!$A${jf}:$A${jl}))',
            fnt=font(False, GREY_TXT, 9), border=BOTTOM, align=CENTER, numfmt="dd/mm/yy")
        ws.row_dimensions[r].height = 15
    status_cf(ws, f"F{FT + 2}:F{FT + 5}")
    light_title(ws, FT, "How it works", "J", "P")
    notes = ["Cream tiles are inputs; everything else updates from the region tabs and the GPS tab.",
             "LSI = injured ÷ uninjured side (Injured side tile). Can exceed 100%. Blank side → falls back to MIN/MAX.",
             "Exit criteria evaluate live from the latest test (by date). Use Override for manual items like pain or gait.",
             "8 slots per block on every tab; rename a spare slot and it appears here and in the criteria dropdown.",
             "Jump battery is identical on every tab. DL CMJ, DL Drop Jump and 10-5 are bilateral — one score, entered in L.",
             "Example rows on the Knee tab and GPS log are flagged in grey — overwrite them."]
    for i, t in enumerate(notes):
        put(ws, f"J{FT + 1 + i}", "•  " + t, fnt=font(False, GREY_TXT, 9), border=None, merge_to=f"P{FT + 1 + i}")
        ws.row_dimensions[FT + 1 + i].height = 24 if len(t) > 95 else 15
    return ws


# ====================================================================== v5 additions
AVAIL = ["Unavailable — training & fixtures", "Modified / partial training", "Full training — not available for fixtures", "Available for selection"]
FOCUS = ["Gym-based — strength focus", "Gym-based — strength + plyometric focus", "Pitch-based — linear running / volume focus", "Full training — cleared"]
ADDONS = [("E", "Accel / decel", "accel/decel"), ("F", "Change of direction", "change of direction"), ("G", "High-speed running", "high-speed running"),
          ("H", "Sprint distance", "sprint distance"), ("I", "Top speed", "top-speed exposure")]
TICK = "✓"
SL_FIRST, SL_LAST = 5, 104
SLQ = "'Status Log'"
DFQ = "'Dash Feed'"
STACK_ROWS = 125
BORDER_ROW = Border(bottom=Side(style="thin", color=FAINT))


def build_lists():
    ws = wb.create_sheet("Lists")
    ws.sheet_properties.tabColor = "A6A6A6"
    for c, w in {"A": 14, "B": 3, "C": 8, "D": 14, "E": 24, "F": 3, "G": 36, "H": 3, "I": 42, "J": 44, "K": 3, "L": 8}.items():
        ws.column_dimensions[c].width = w
    put(ws, "A1", "Dropdown sources. You can reword items, but keep the order — the Dashboard reads Pitch-based by its first word.",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="L1")
    for col, lab in (("A", "Region"), ("C", "Y / N"), ("D", "Session type"), ("E", "Phase (generic)"), ("G", "GPS criteria labels"),
                     ("I", "Availability"), ("J", "Current focus (base)"), ("L", "Tick")):
        put(ws, f"{col}2", lab, f=MID_BLUE, fnt=font(True, WHITE, 9), align=CENTER)
    for i, r in enumerate(REGIONS): put(ws, f"A{3 + i}", r, f=INPUT)
    put(ws, "C3", "Y", f=INPUT, align=CENTER); put(ws, "C4", "N", f=INPUT, align=CENTER)
    for i, x in enumerate(["Rehab", "Training", "Match", "Individual", "Other"]): put(ws, f"D{3 + i}", x, f=INPUT)
    for i, x in enumerate(PHASES): put(ws, f"E{3 + i}", x, f=INPUT)
    for i, x in enumerate(GPS_LABELS): put(ws, f"G{3 + i}", x, f=PALE_BLUE)
    for i, x in enumerate(AVAIL): put(ws, f"I{3 + i}", x, f=INPUT)
    for i, x in enumerate(FOCUS): put(ws, f"J{3 + i}", x, f=INPUT)
    put(ws, "L3", TICK, f=INPUT, align=CENTER)
    return ws


def pick(cell_ref):
    parts = ",".join(f"{q(r)}!{cell_ref}" for r in REGIONS)
    return f"CHOOSE(MATCH({DFQ}!$B$10,Lists!$A$3:$A${2 + len(REGIONS)},0),{parts})"


# ---------------------------------------------------------------------- Status Log
def build_status_log():
    ws = wb.create_sheet("Status Log")
    ws.sheet_properties.tabColor = YELLOW
    ws.sheet_view.showGridLines = False
    for c, w in {"A": 12, "B": 6, "C": 38, "D": 40, "E": 9, "F": 9, "G": 9, "H": 9, "I": 9, "J": 70, "K": 34}.items():
        ws.column_dimensions[c].width = w
    put(ws, "A1", "Status Log — availability & current focus", f=BLUE, fnt=font(True, WHITE, 16), merge_to="K1")
    ws.row_dimensions[1].height = 28
    put(ws, "A2", "Add a row whenever the player's availability or focus changes. The newest entry (by date) drives the Dashboard headline; "
                  "the list itself is the stage history. Pitch add-ons stack — keep earlier ticks on as you add new ones.",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="K2")
    ws.row_dimensions[2].height = 28
    col_headers(ws, 4, [("Date", 1), ("Wk", 1), ("Availability", 1), ("Current focus (base)", 1), ("Accel / decel", 1), ("Change of direction", 1),
                        ("High-speed running", 1), ("Sprint distance", 1), ("Top speed", 1), ("Headline (auto)", 1), ("Notes", 1)], height=32)
    for r in range(SL_FIRST, SL_LAST + 1):
        put(ws, f"A{r}", None, f=INPUT, align=CENTER, numfmt="dd/mm/yyyy")
        put(ws, f"B{r}", f'=IF(A{r}="","",IF(Dashboard!{DASH["inj_date"]}="","",INT((A{r}-Dashboard!{DASH["inj_date"]})/7)+1))', f=PALE_BLUE, fnt=font(False, GREY_TXT, 9), align=CENTER)
        put(ws, f"C{r}", None, f=INPUT)
        put(ws, f"D{r}", None, f=INPUT)
        for col, _, _ in ADDONS: put(ws, f"{col}{r}", None, f=INPUT, fnt=font(True, BLUE, 11), align=CENTER)
        parts = ",".join(f'IF({col}{r}<>"","{txt}","")' for col, _, txt in ADDONS)
        put(ws, f"J{r}", f'=IF(OR(A{r}="",D{r}=""),"",D{r}&IF(COUNTA(E{r}:I{r})=0,""," + "&_xlfn.TEXTJOIN(" + ",TRUE,{parts})))',
            f=PALE_BLUE, fnt=font(False, "000000", 9))
        put(ws, f"K{r}", None, f=INPUT)
    for col, lst in (("C", f"=Lists!$I$3:$I${2 + len(AVAIL)}"), ("D", f"=Lists!$J$3:$J${2 + len(FOCUS)}"), ("E", "=Lists!$L$3")):
        dv = DataValidation(type="list", formula1=lst, allow_blank=True); ws.add_data_validation(dv)
        dv.add(f"{col}{SL_FIRST}:{col}{SL_LAST}" if col != "E" else f"E{SL_FIRST}:I{SL_LAST}")
    ws.conditional_formatting.add(f"E{SL_FIRST}:I{SL_LAST}", FormulaRule(formula=[f'E{SL_FIRST}<>""'], fill=fill(LIGHT_BLUE)))
    for pat, fl_, fc_ in (("Unavailable", BAD_FILL, BAD_FONT), ("Available for selection", GOOD_FILL, GOOD_FONT)):
        ws.conditional_formatting.add(f"C{SL_FIRST}:C{SL_LAST}", FormulaRule(formula=[f'ISNUMBER(SEARCH("{pat}",C{SL_FIRST}))'], fill=fill(fl_), font=Font(name=FONT_NAME, color=fc_)))
    ws.freeze_panes = "A5"
    ex = [(dt.date(2026, 8, 10), AVAIL[0], FOCUS[0], ""), (dt.date(2026, 9, 14), AVAIL[0], FOCUS[1], ""),
          (dt.date(2026, 10, 12), AVAIL[0], FOCUS[2], ""), (dt.date(2026, 10, 19), AVAIL[0], FOCUS[2], "E")]
    for i, (d, a, f_, ticks) in enumerate(ex):
        r = SL_FIRST + i
        ws[f"A{r}"], ws[f"C{r}"], ws[f"D{r}"] = d, a, f_
        for col in ticks: ws[f"{col}{r}"] = TICK
        ws[f"K{r}"] = "EXAMPLE ROW — overwrite / delete"; ws[f"K{r}"].font = font(False, GREY_TXT, 9, italic=True)
    return ws


# ---------------------------------------------------------------------- Dash Feed (helper)
DF = dict(reg_first=4, chart=10, total=11, st_first=14, chips_first=24, hist_first=33, blk_first=42, stack_first=50)


def build_dash_feed():
    ws = wb.create_sheet("Dash Feed")
    ws.sheet_properties.tabColor = "A6A6A6"
    for c, w in {"A": 18, "B": 14, "C": 10, "D": 10, "E": 12, "F": 16, "G": 40, "H": 12, "I": 10, "J": 10, "K": 12, "L": 12}.items():
        ws.column_dimensions[c].width = w
    g9 = font(False, GREY_TXT, 9)
    put(ws, "A1", "Dashboard helper (auto) — stacks the ticked regions, the status headline, exposure chips, history and blockers. Nothing to edit here.",
        fnt=font(False, GREY_TXT, 9, italic=True), border=None, merge_to="L1")
    rf, rl, sf, sl, jf, jl = R["rom_first"], R["rom_last"], R["str_first"], R["str_last"], R["jmp_first"], R["jmp_last"]
    lf, ll, s = R["list_first"], R["list_last"], R["ph_sum"]
    # regions table
    col_headers(ws, 3, [(h, 1) for h in ("Region", "Ticked", "Tests in use", "List rows", "Start row", "Tick rank", "Current phase", "Cleared", "Status", "Open criteria", "Last test")],
                f=LIGHT_BLUE, color=BLUE, size=9, height=18)
    for i, reg in enumerate(REGIONS):
        r, qs = DF["reg_first"] + i, q(reg)
        put(ws, f"A{r}", reg, fnt=g9)
        put(ws, f"B{r}", f'=Dashboard!{TICKS[reg]}<>""', fnt=g9, align=CENTER)
        put(ws, f"C{r}", f'=COUNTIF({qs}!$C${lf}:$C${ll},"?*")', fnt=g9, align=CENTER)
        put(ws, f"D{r}", f"=IF(B{r},C{r}+1,0)", fnt=g9, align=CENTER)
        put(ws, f"E{r}", "=1" if i == 0 else f"=E{r - 1}+D{r - 1}", fnt=g9, align=CENTER)
        put(ws, f"F{r}", f'=IF(B{r},COUNTIF($B${DF["reg_first"]}:B{r},TRUE),"")', fnt=g9, align=CENTER)
        put(ws, f"G{r}", f"={qs}!$E${s}", fnt=g9)
        put(ws, f"H{r}", f"={qs}!$O${s}", fnt=g9, align=CENTER)
        put(ws, f"I{r}", f"={qs}!$R${s}", fnt=g9, align=CENTER)
        put(ws, f"J{r}", f'=IF({qs}!$T${s}="",IF(I{r}="COMPLETE","All phases cleared","—"),{qs}!$T${s})', fnt=g9)
        put(ws, f"K{r}", f'=IF(COUNT({qs}!$A${rf}:$A${rl},{qs}!$A${sf}:$A${sl},{qs}!$A${jf}:$A${jl})=0,"",MAX({qs}!$A${rf}:$A${rl},{qs}!$A${sf}:$A${sl},{qs}!$A${jf}:$A${jl}))',
            fnt=g9, align=CENTER, numfmt="dd/mm/yy")
    a, b = DF["reg_first"], DF["reg_first"] + len(REGIONS) - 1
    put(ws, f"A{DF['chart']}", "Chart region", fnt=font(True, BLUE, 9))
    put(ws, f"B{DF['chart']}", f'=IF(Dashboard!{DASH["chart"]}<>"",Dashboard!{DASH["chart"]},IFERROR(INDEX($A${a}:$A${b},MATCH(1,$F${a}:$F${b},0)),$A${a}))', fnt=font(True, BLUE, 9))
    put(ws, f"A{DF['total']}", "Total list rows", fnt=font(True, BLUE, 9))
    put(ws, f"B{DF['total']}", f"=SUM(D{a}:D{b})", fnt=font(True, BLUE, 9))

    # status (latest Status Log entry by date)
    A_, D_ = f"{SLQ}!$A${SL_FIRST}:$A${SL_LAST}", f"{SLQ}!$D${SL_FIRST}:$D${SL_LAST}"
    def slc(col): return f"{SLQ}!${col}${SL_FIRST}:${col}${SL_LAST}"
    def earliest(cond):  # earliest log date where cond (array) is true
        x = f"SUMPRODUCT(SMALL(({cond})*ISNUMBER({A_})*{A_}+(1-({cond})*ISNUMBER({A_}))*99999,1))"
        return f'IF({x}>=99999,"",{x})'
    st = DF["st_first"]
    rows = [("Latest entry (row)", f'=IF(COUNT({A_})=0,"",SUMPRODUCT(MAX(({A_}=MAX({A_}))*(ROW({A_})-ROW({SLQ}!$A${SL_FIRST})+1))))'),
            ("Availability", f'=IF(B{st}="","Not set — add an entry on the Status Log tab",INDEX({slc("C")},B{st}))'),
            ("Headline focus", f'=IF(B{st}="","—",INDEX({slc("J")},B{st}))'),
            ("Base focus", f'=IF(B{st}="","",INDEX({slc("D")},B{st}))'),
            ("Base since", f'=IF(B{st + 3}="","",{earliest(f"{D_}=B{st + 3}")})'),
            ("Base since wk", f'=IF(OR(B{st + 4}="",Dashboard!{DASH["inj_date"]}=""),"",INT((B{st + 4}-Dashboard!{DASH["inj_date"]})/7)+1)'),
            ("Latest GPS week", f"='Chart Feed'!$H${CF['gps_hdr'] + 1}")]
    for i, (lab, fml) in enumerate(rows):
        put(ws, f"A{st + i}", lab, fnt=g9)
        put(ws, f"B{st + i}", fml, fnt=g9, numfmt="dd/mm/yy" if "since" in lab and "wk" not in lab else "General", merge_to=f"G{st + i}")
    wkc = f"$B${st + 6}"
    put(ws, f"H{st + 6}", f'=IF(OR({wkc}="",{wkc}=0),"","Latest logged GPS week: wk "&{wkc})', fnt=g9, merge_to=f"L{st + 6}")

    # exposure chips
    cf0 = DF["chips_first"]
    col_headers(ws, cf0 - 1, [("Chip", 1), ("Active", 1), ("This week", 3), ("Since", 4)], f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    wf, wl, br = G["wk_first"], G["wk_last"], G["base_row"]
    def gw(col): return f"INDEX(GPS!${col}${wf}:${col}${wl},{wkc})"
    nog = f'OR({wkc}="",{wkc}=0)'
    chips = [("Running volume", f'=IF(LEFT(B{st + 3},5)="Pitch",1,0)', f'=IF({nog},"no GPS logged",IFERROR(TEXT({gw("C")},"#,##0")&" m total","—"))',
              earliest(f'LEFT({D_},5)="Pitch"')),
             ("Accel / decel", None, f'=IF({nog},"",IFERROR(TEXT({gw("F")}+{gw("G")},"0")&" acc + dec","—"))', None),
             ("Change of direction", None, '="not GPS-tracked"', None),
             ("High-speed running", None, f'=IF({nog},"",IFERROR(TEXT({gw("D")},"#,##0")&" m HSR","—"))', None),
             ("Sprint distance", None, f'=IF({nog},"",IFERROR(TEXT({gw("E")},"#,##0")&" m sprint","—"))', None),
             ("Top speed", None, f'=IF({nog},"",IFERROR(TEXT({gw("H")},"0.0")&" m/s · "&TEXT({gw("H")}/GPS!$H${br},"0%"),"—"))', None)]
    for i, (name, act, val, since) in enumerate(chips):
        r = cf0 + i
        if act is None:
            col = ADDONS[i - 1][0]
            act = f'=IF(B{st}="",0,IF(INDEX({slc(col)},B{st})<>"",1,0))'
            since = earliest(f'{slc(col)}<>""')
        put(ws, f"A{r}", name, fnt=g9)
        put(ws, f"B{r}", act, fnt=g9, align=CENTER)
        put(ws, f"C{r}", val, fnt=g9, merge_to=f"E{r}")
        put(ws, f"F{r}", f'=IF({since}="","not yet introduced","since "&TEXT({since},"dd/mm/yy")&IF(Dashboard!{DASH["inj_date"]}="",""," · wk "&(INT(({since}-Dashboard!{DASH["inj_date"]})/7)+1)))',
            fnt=g9, merge_to=f"I{r}")

    # history: last 6 log entries, oldest -> newest
    h0 = DF["hist_first"]
    col_headers(ws, h0 - 1, [("Position", 1), ("k", 1), ("Date", 1), ("Row", 1), ("Date · wk", 2), ("Headline", 4), ("Availability", 2)], f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    n = f"MIN(6,COUNT({A_}))"
    for p_ in range(1, 7):
        r = h0 + p_ - 1
        put(ws, f"A{r}", p_, fnt=g9, align=CENTER)
        put(ws, f"B{r}", f'=IF({p_}>{n},"",{n}-{p_}+1)', fnt=g9, align=CENTER)
        put(ws, f"C{r}", f'=IF(B{r}="","",LARGE({A_},B{r}))', fnt=g9, align=CENTER, numfmt="dd/mm/yy")
        put(ws, f"D{r}", f'=IF(B{r}="","",SUMPRODUCT(MAX(({A_}=C{r})*(ROW({A_})-ROW({SLQ}!$A${SL_FIRST})+1))))', fnt=g9, align=CENTER)
        put(ws, f"E{r}", f'=IF(B{r}="","",TEXT(C{r},"dd/mm/yy")&IF(INDEX({slc("B")},D{r})="","","   ·   wk "&INDEX({slc("B")},D{r})))', fnt=g9, merge_to=f"F{r}")
        put(ws, f"G{r}", f'=IF(B{r}="","",INDEX({slc("J")},D{r}))', fnt=g9, merge_to=f"J{r}")
        put(ws, f"K{r}", f'=IF(B{r}="","",INDEX({slc("C")},D{r}))', fnt=g9, merge_to=f"L{r}")

    # blockers (ticked regions in order)
    k0 = DF["blk_first"]
    col_headers(ws, k0 - 1, [("k", 1), ("Region idx", 1), ("Region", 1), ("Phase", 2), ("Cleared", 1), ("Open criteria", 6)], f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    for k in range(1, len(REGIONS) + 1):
        r = k0 + k - 1
        put(ws, f"A{r}", k, fnt=g9, align=CENTER)
        put(ws, f"B{r}", f'=IFERROR(MATCH({k},$F${a}:$F${b},0),"")', fnt=g9, align=CENTER)
        for col, src, mt in (("C", "A", None), ("D", "G", "E"), ("F", "H", None), ("G", "J", "L")):
            put(ws, f"{col}{r}", f'=IF($B{r}="","",INDEX(${src}${a}:${src}${b},$B{r}))', fnt=g9, merge_to=f"{mt}{r}" if mt else None)

    # stacked tests list
    s0 = DF["stack_first"]
    col_headers(ws, s0 - 1, [(h, 1) for h in ("k", "Region idx", "Offset", "Header?", "Region", "→ Block", "→ Test", "→ L", "→ R", "→ LSI", "→ Δ", "→ Date")],
                f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    def ch(col, r): return "CHOOSE($B{0},".format(r) + ",".join(f"INDEX({q(reg)}!${col}${lf}:${col}${ll},$C{r})" for reg in REGIONS) + ")"
    for k in range(1, STACK_ROWS + 1):
        r = s0 + k - 1
        put(ws, f"A{r}", k, fnt=g9, align=CENTER, border=BOTTOM)
        put(ws, f"B{r}", f'=IF($A{r}>$B${DF["total"]},"",COUNTIF($E${a}:$E${b},"<="&$A{r}))', fnt=g9, align=CENTER, border=BOTTOM)
        put(ws, f"C{r}", f'=IF($B{r}="","",$A{r}-INDEX($E${a}:$E${b},$B{r}))', fnt=g9, align=CENTER, border=BOTTOM)
        put(ws, f"D{r}", f'=IF($B{r}="",FALSE,$C{r}=0)', fnt=g9, align=CENTER, border=BOTTOM)
        put(ws, f"E{r}", f'=IF($B{r}="","",INDEX($A${a}:$A${b},$B{r}))', fnt=g9, border=BOTTOM)
        put(ws, f"F{r}", f'=IF($B{r}="","",IF($D{r},UPPER($E{r}),{ch("I", r)}))', fnt=g9, border=BOTTOM)
        put(ws, f"G{r}", f'=IF($B{r}="","",IF($D{r},INDEX($G${a}:$G${b},$B{r})&"  ·  "&INDEX($H${a}:$H${b},$B{r}),{ch("C", r)}))', fnt=g9, border=BOTTOM)
        for col, src, nf in (("H", "E", "General"), ("I", "F", "General"), ("J", "G", "0%"), ("K", "K", "General")):
            put(ws, f"{col}{r}", f'=IF(OR($B{r}="",$D{r}),"",{ch(src, r)})', fnt=g9, align=CENTER, numfmt=nf, border=BOTTOM)
        put(ws, f"L{r}", f'=IF($B{r}="","",IF($D{r},INDEX($K${a}:$K${b},$B{r}),{ch("H", r)}))', fnt=g9, align=CENTER, numfmt="dd/mm/yy", border=BOTTOM)
    return ws


# ---------------------------------------------------------------------- Dashboard
CHIP_GROUPS = [("B", "C"), ("D", "F"), ("G", "I"), ("K", "L"), ("M", "O"), ("P", "Q")]
LIST_FIRST = 41
FOOT = LIST_FIRST + STACK_ROWS + 3


def build_dashboard():
    ws = wb.active
    ws.title = "Dashboard"
    ws.sheet_properties.tabColor = YELLOW
    ws.sheet_view.showGridLines = False
    ws.sheet_view.zoomScale = 90
    for c, w in {"A": 2, "B": 11, "C": 13, "D": 13, "E": 8, "F": 8, "G": 8, "H": 9, "I": 10, "J": 2, "K": 18,
                 "L": 9, "M": 9, "N": 9, "O": 9, "P": 9, "Q": 9, "R": 2}.items():
        ws.column_dimensions[c].width = w
    feed = wb["Chart Feed"]
    g8i = font(False, GREY_TXT, 8, italic=True)

    # header
    put(ws, "B1", "Rehabilitation Dashboard", f=BLUE, fnt=font(True, WHITE, 18), border=None, merge_to="L1")
    put(ws, "M1", "LEEDS UNITED ACADEMY  ·  SPORTS MEDICINE", f=BLUE, fnt=font(True, YELLOW, 9), border=None,
        align=Alignment(horizontal="right", vertical="center"), merge_to="Q1")
    ws.row_dimensions[1].height = 36
    put(ws, "B2", None, f=YELLOW, border=None, merge_to="Q2"); ws.row_dimensions[2].height = 5
    ws.row_dimensions[3].height = 10

    def tile(lr, c1, c2, label, value, *, is_input, numfmt="General", big=False, align=CENTER, color=None):
        put(ws, f"{c1}{lr}", label.upper(), fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(horizontal="left", vertical="bottom"),
            merge_to=f"{c2}{lr}" if c2 != c1 else None)
        put(ws, f"{c1}{lr + 1}", value, f=INPUT if is_input else PALE_BLUE, fnt=font(True, color or (BLUE if not is_input else "000000"), 14 if big else 10),
            align=align, numfmt=numfmt, merge_to=f"{c2}{lr + 1}" if c2 != c1 else None)

    inj = DASH["inj_date"]
    # player / injury row
    tile(4, "B", "D", "Player", "Example Player", is_input=True, align=LEFT)
    tile(4, "E", "F", "Position · squad", "CM · U16", is_input=True)
    tile(4, "G", "I", "Injury / diagnosis", "e.g. L ACL reconstruction", is_input=True, align=LEFT)
    tile(4, "K", "K", "Injured side", "L", is_input=True)
    tile(4, "L", "M", "Injury date", EXAMPLE_INJURY_DATE, is_input=True, numfmt="dd/mm/yyyy")
    tile(4, "N", "O", "Week of rehab", f'=IF({inj}="","",INT((TODAY()-{inj})/7)+1)', is_input=False, big=True)
    tile(4, "P", "Q", "Expected RTP", dt.date(2027, 2, 1), is_input=True, numfmt="dd/mm/yyyy")
    ws["N5"].fill = fill(YELLOW); ws["O5"].fill = fill(YELLOW)
    ws["G5"].font = font(False, GREY_TXT, 10, italic=True)
    ws.row_dimensions[4].height = 13; ws.row_dimensions[5].height = 26; ws.row_dimensions[6].height = 6
    # anthropometrics row
    tile(7, "B", "B", "DOB", dt.date(2011, 3, 14), is_input=True, numfmt="dd/mm/yy")
    tile(7, "C", "C", "Age (yrs)", '=IF(B8="","",(TODAY()-B8)/365.25)', is_input=False, numfmt="0.0")
    tile(7, "D", "D", "Age at injury", f'=IF(OR(B8="",{inj}=""),"",({inj}-B8)/365.25)', is_input=False, numfmt="0.0")
    tile(7, "E", "F", "Height (cm)", 171.4, is_input=True, numfmt="0.0")
    tile(7, "G", "H", "Body mass (kg)", 58.2, is_input=True, numfmt="0.0")
    tile(7, "I", "I", "Mat. offset", 0.6, is_input=True, numfmt="+0.0;-0.0;0.0")
    tile(7, "L", "M", "% PAH", None, is_input=True, numfmt="0.0")
    pah = "IF(L8<=1.5,L8*100,L8)"
    tile(7, "K", "K", "Maturity",
         f'=IF(L8<>"",IF({pah}<85,"Pre-PHV",IF({pah}<=95,"Circa-PHV","Post-PHV")),IF(I8<>"",IF(I8<-1,"Pre-PHV",IF(I8<=1,"Circa-PHV","Post-PHV")),""))',
         is_input=False)
    tile(7, "N", "O", "Measured on", dt.date(2026, 9, 1), is_input=True, numfmt="dd/mm/yyyy")
    tile(7, "P", "Q", "Days post injury", f'=IF({inj}="","",TODAY()-{inj})', is_input=False, numfmt="0")
    ws.row_dimensions[7].height = 13; ws.row_dimensions[8].height = 24
    put(ws, "B9", "Maturity: % predicted adult height (PAH) if entered — <85% pre · 85–95% circa · >95% post — otherwise maturity offset (< −1 pre · −1 to +1 circa · > +1 post).", fnt=g8i, border=None, merge_to="Q9")
    ws.row_dimensions[9].height = 14
    ws.row_dimensions[10].height = 8
    dv = DataValidation(type="list", formula1='"L,R"', allow_blank=True); ws.add_data_validation(dv); dv.add("K5")

    # ---- current status
    st = DF["st_first"]
    light_title(ws, 11, "Current status", "B", "Q")
    put(ws, "B12", "AVAILABILITY", fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(vertical="bottom"), merge_to="I12")
    put(ws, "K12", "CURRENT FOCUS", fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(vertical="bottom"), merge_to="Q12")
    put(ws, "B13", f"={DFQ}!$B${st + 1}", f=PALE_BLUE, fnt=font(True, "000000", 12), align=CENTER, merge_to="I13")
    put(ws, "K13", f"={DFQ}!$B${st + 2}", f=PALE_BLUE, fnt=font(True, BLUE, 11), align=LEFT, merge_to="Q13")
    for pat, fl_, fc_ in (("Unavailable", BAD_FILL, BAD_FONT), ("Available for selection", GOOD_FILL, GOOD_FONT),
                          ("Modified", WARN_FILL, WARN_FONT), ("not available", WARN_FILL, WARN_FONT)):
        ws.conditional_formatting.add("B13:I13", FormulaRule(formula=[f'ISNUMBER(SEARCH("{pat}",$B$13))'], fill=fill(fl_), font=Font(name=FONT_NAME, bold=True, size=12, color=fc_)))
    ws.row_dimensions[12].height = 13; ws.row_dimensions[13].height = 30
    put(ws, "B14", f'=IF({DFQ}!$B${st + 4}="","Set availability and focus on the Status Log tab (newest entry by date drives this headline).",'
                   f'"In current focus since "&TEXT({DFQ}!$B${st + 4},"dd/mm/yy")&IF({DFQ}!$B${st + 5}="",""," (wk "&{DFQ}!$B${st + 5}&")")&"   ·   set on the Status Log tab")',
        fnt=g8i, border=None, merge_to="Q14")
    ws.row_dimensions[15].height = 8

    # exposure chips
    put(ws, "B16", f'="PITCH EXPOSURE   ·   "&IF({DFQ}!$H${st + 6}="","no GPS sessions logged yet",UPPER({DFQ}!$H${st + 6}))', fnt=font(True, GREY_TXT, 8),
        border=None, align=Alignment(vertical="bottom"), merge_to="Q16")
    c0 = DF["chips_first"]
    for i, (a_, b_) in enumerate(CHIP_GROUPS):
        r = c0 + i
        put(ws, f"{a_}17", f"={DFQ}!$A${r}", f=GREY_CELL, fnt=font(True, GREY_TXT, 9), align=CENTER, merge_to=f"{b_}17")
        put(ws, f"{a_}18", f"={DFQ}!$C${r}", f=GREY_CELL, fnt=font(True, GREY_TXT, 10), align=CENTER, merge_to=f"{b_}18")
        put(ws, f"{a_}19", f"={DFQ}!$F${r}", f=GREY_CELL, fnt=font(False, GREY_TXT, 8), align=CENTER, merge_to=f"{b_}19")
        put(ws, f"{a_}20", f"={DFQ}!$B${r}", border=None, numfmt=";;;")
        rng = f"{a_}17:{b_}19"
        ws.conditional_formatting.add(f"{a_}17:{b_}17", FormulaRule(formula=[f"${a_}$20=1"], fill=fill(BLUE), font=Font(name=FONT_NAME, bold=True, color=WHITE)))
        ws.conditional_formatting.add(f"{a_}18:{b_}19", FormulaRule(formula=[f"${a_}$20=1"], fill=fill(LIGHT_BLUE), font=Font(name=FONT_NAME, bold=True, color=BLUE)))
    ws.row_dimensions[17].height = 20; ws.row_dimensions[18].height = 20; ws.row_dimensions[19].height = 15; ws.row_dimensions[20].height = 6

    # stage history strip
    put(ws, "B21", "STAGE HISTORY   ·   last six Status Log entries, oldest → newest", fnt=font(True, GREY_TXT, 8), border=None,
        align=Alignment(vertical="bottom"), merge_to="Q21")
    h0 = DF["hist_first"]
    for i, (a_, b_) in enumerate(CHIP_GROUPS):
        r = h0 + i
        put(ws, f"{a_}22", f"={DFQ}!$E${r}", fnt=font(True, BLUE, 8), border=Border(top=Side(style="medium", color=YELLOW)), align=LEFT, merge_to=f"{b_}22")
        put(ws, f"{a_}23", f"={DFQ}!$G${r}", fnt=font(False, "000000", 9), border=None, align=Alignment(horizontal="left", vertical="top", wrap_text=True), merge_to=f"{b_}23")
        put(ws, f"{a_}24", f"={DFQ}!$K${r}", fnt=font(False, GREY_TXT, 8, italic=True), border=None, align=Alignment(horizontal="left", vertical="top", wrap_text=True), merge_to=f"{b_}24")
        ws.conditional_formatting.add(f"{a_}22:{b_}22", FormulaRule(formula=[f'${a_}$22=""'], border=Border()))
    ws.row_dimensions[22].height = 16; ws.row_dimensions[23].height = 40; ws.row_dimensions[24].height = 24; ws.row_dimensions[25].height = 10

    # region ticks
    light_title(ws, 26, "Regions shown on this dashboard", "B", "Q")
    reg_groups = [("B", "C"), ("D", "E"), ("F", "G"), ("H", "I"), ("K", "L")]
    for reg, (a_, b_) in zip(REGIONS, reg_groups):
        put(ws, f"{a_}27", reg.upper(), fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(horizontal="center", vertical="bottom"), merge_to=f"{b_}27")
        put(ws, f"{a_}28", TICK if reg in ("Hip", "Knee") else None, f=INPUT, fnt=font(True, WHITE, 14), align=CENTER, merge_to=f"{b_}28")
        ws.conditional_formatting.add(f"{a_}28:{b_}28", FormulaRule(formula=[f'${a_}$28<>""'], fill=fill(BLUE), font=Font(name=FONT_NAME, bold=True, color=WHITE)))
    tdv = DataValidation(type="list", formula1="=Lists!$L$3", allow_blank=True); ws.add_data_validation(tdv)
    for a_, _ in reg_groups: tdv.add(f"{a_}28")
    put(ws, "M27", "LSI TARGET", fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(horizontal="center", vertical="bottom"), merge_to="N27")
    put(ws, "M28", 0.9, f=INPUT, fnt=font(True, "000000", 11), align=CENTER, numfmt="0%", merge_to="N28")
    put(ws, "O27", "CHARTS SHOW", fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(horizontal="center", vertical="bottom"), merge_to="Q27")
    put(ws, "O28", "Knee", f=INPUT, fnt=font(True, "000000", 11), align=CENTER, merge_to="Q28")
    cdv = DataValidation(type="list", formula1=f"=Lists!$A$3:$A${2 + len(REGIONS)}", allow_blank=True); ws.add_data_validation(cdv); cdv.add("O28")
    ws.row_dimensions[27].height = 13; ws.row_dimensions[28].height = 26
    put(ws, "B29", "Tick (✓) the regions relevant to this player — only ticked regions appear below, stacked in this order. "
                   "Clear a cell to hide that region. 'Charts show' picks the region the progression charts plot (blank = first ticked).",
        fnt=g8i, border=None, merge_to="Q29")
    ws.row_dimensions[29].height = 22; ws.row_dimensions[30].height = 8

    # blockers
    light_title(ws, 31, "What's open — criteria still to meet for the current phase", "B", "Q")
    col_headers(ws, 32, [("Region", 2), ("Current phase", 3), ("Cleared", 1), ("Open criteria", 10)], start_col=2, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    ws.unmerge_cells("I32:Q32") if False else None
    k0 = DF["blk_first"]
    for i in range(len(REGIONS)):
        r, src = 33 + i, k0 + i
        put(ws, f"B{r}", f"={DFQ}!$C${src}", fnt=font(True, "000000", 9), border=None, merge_to=f"C{r}")
        put(ws, f"D{r}", f"={DFQ}!$D${src}", fnt=font(False, BLUE, 9), border=None, merge_to=f"F{r}")
        put(ws, f"G{r}", f"={DFQ}!$F${src}", fnt=font(False, "000000", 9), border=None, align=CENTER)
        put(ws, f"H{r}", f"={DFQ}!$G${src}", fnt=font(False, "000000", 9), border=None, merge_to=f"Q{r}")
        ws.row_dimensions[r].height = 18
    ws.conditional_formatting.add("B33:Q37", FormulaRule(formula=['$B33<>""'], border=BORDER_ROW))
    ws.row_dimensions[38].height = 10

    # latest tests (stacked)
    light_title(ws, 39, "Latest tests   ·   ticked regions", "B", "I")
    col_headers(ws, 40, [("Block", 1), ("Test", 2), ("L / score", 1), ("R", 1), ("LSI", 1), ("Δ prev", 1), ("Date", 1)], start_col=2, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    s0 = DF["stack_first"]
    for k in range(STACK_ROWS):
        r, src = LIST_FIRST + k, s0 + k
        put(ws, f"A{r}", f"=IF({DFQ}!$D${src},1,0)", border=None, numfmt=";;;")
        put(ws, f"B{r}", f"={DFQ}!$F${src}", fnt=font(True, GREY_TXT, 8), border=None, align=Alignment(vertical="center"))
        put(ws, f"C{r}", f"={DFQ}!$G${src}", fnt=font(False, "000000", 9), border=None, align=Alignment(vertical="center"), merge_to=f"D{r}")
        for col, sc, nf in (("E", "H", "General"), ("F", "I", "General"), ("G", "J", "0%"), ("H", "K", "General"), ("I", "L", "dd/mm/yy")):
            put(ws, f"{col}{r}", f"={DFQ}!${sc}${src}", fnt=font(col == "G", "000000" if col != "I" else GREY_TXT, 9), border=None, align=CENTER, numfmt=nf)
        ws.row_dimensions[r].height = 15
    last = LIST_FIRST + STACK_ROWS - 1
    rng = f"B{LIST_FIRST}:I{last}"
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f"$A{LIST_FIRST}=1"], fill=fill(BLUE), font=Font(name=FONT_NAME, bold=True, color=WHITE)))
    ws.conditional_formatting.add(rng, FormulaRule(formula=[f'$C{LIST_FIRST}<>""'], border=BORDER_ROW))
    ratio_cf(ws, f"G{LIST_FIRST}:G{last}", good=DASH["target"], warn=f"({DASH['target']}-0.1)")
    ws.conditional_formatting.add(f"H{LIST_FIRST}:H{last}", FormulaRule(formula=[f'LEFT(H{LIST_FIRST},1)="+"'], font=Font(name=FONT_NAME, color=GOOD_FONT, bold=True)))
    ws.conditional_formatting.add(f"H{LIST_FIRST}:H{last}", FormulaRule(formula=[f'LEFT(H{LIST_FIRST},1)="-"'], font=Font(name=FONT_NAME, color=BAD_FONT, bold=True)))

    # GPS block (right)
    light_title(ws, 39, "GPS   ·   weekly pitch load", "K", "Q")
    col_headers(ws, 40, [("", 1)] + [(m, 1) for m, _ in GPS_METRICS], start_col=11, f=LIGHT_BLUE, color=BLUE, size=8, height=24)
    wf, wl, br = G["wk_first"], G["wk_last"], G["base_row"]
    latest_cell = f"'Chart Feed'!$H${CF['gps_hdr'] + 1}"
    gps_rows = [("Pre-injury baseline", lambda c: f'=IF(GPS!{c}{br}="","",GPS!{c}{br})'),
                (f'="Latest week"&IF({latest_cell}=0,""," (wk "&{latest_cell}&")")', lambda c: f'=IFERROR(IF(INDEX(GPS!{c}${wf}:{c}${wl},{latest_cell})="","",INDEX(GPS!{c}${wf}:{c}${wl},{latest_cell})),"")'),
                ("% of baseline", None),
                ("Best week to date", lambda c: f'=IF(COUNT(GPS!{c}${wf}:{c}${wl})=0,"",MAX(GPS!{c}${wf}:{c}${wl}))')]
    for i, (label, fml) in enumerate(gps_rows):
        r = LIST_FIRST + i
        put(ws, f"K{r}", label, fnt=font(True, GREY_TXT, 9), border=BOTTOM)
        for (m, gcol), dc in zip(GPS_METRICS, ["L", "M", "N", "O", "P", "Q"]):
            nf = "0.0" if gcol == "H" else "#,##0"
            if fml: put(ws, f"{dc}{r}", fml(gcol), fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER, numfmt=nf)
            else: put(ws, f"{dc}{r}", f'=IFERROR(IF(OR({dc}{r - 1}="",{dc}{r - 2}=""),"",{dc}{r - 1}/{dc}{r - 2}),"")', fnt=font(True, "000000", 9), border=BOTTOM, align=CENTER, numfmt="0%")
    ratio_cf(ws, f"L{LIST_FIRST + 2}:Q{LIST_FIRST + 2}", "1", "0.8")
    put(ws, f"K{LIST_FIRST + 4}", "Speeds in m/s. Criteria, baseline and session log on the GPS tab.", fnt=g8i, border=None, merge_to=f"Q{LIST_FIRST + 4}")
    gh = CF["gps_hdr"]
    cats = Reference(feed, range_string=f"'Chart Feed'!$A${gh + 2}:$A${gh + 53}")
    line_chart(ws, f"K{LIST_FIRST + 6}", "Weekly total distance (m)", cats, [(Reference(feed, range_string=f"'Chart Feed'!$B${gh + 2}:$B${gh + 53}"), f"'Chart Feed'!$B${gh + 1}")],
               "metres", width=13.4, height=6.4, legend=False, x_title="Rehab week")
    pr = LIST_FIRST + 21
    light_title(ws, pr, f'="Progression   ·   LSI by rehab week   ·   "&{DFQ}!$B${DF["chart"]}&"   (target "&TEXT({DASH["target"]},"0%")&")"', "K", "Q")
    for i, (key, label) in enumerate(BLOCKS):
        h = CF[f"{key}_hdr"]
        x = Reference(feed, range_string=f"'Chart Feed'!$A${h + 2}:$A${h + 13}")
        series = [(Reference(feed, range_string=f"'Chart Feed'!${get_column_letter(2 + k)}${h + 2}:${get_column_letter(2 + k)}${h + 13}"),
                   f"'Chart Feed'!${get_column_letter(2 + k)}${h + 1}") for k in range(SLOTS)]
        scatter_chart(ws, f"K{pr + 2 + i * 22}", f"{label} — LSI", x, series, "LSI", width=13.4, height=10.5, y_fmt="0%", y_min=0.4)

    # footer
    FT = FOOT
    light_title(ws, FT, "All regions at a glance", "B", "I")
    col_headers(ws, FT + 1, [("Region", 1), ("Current phase", 2), ("Cleared", 1), ("Status", 2), ("Last test", 2)], start_col=2, f=LIGHT_BLUE, color=BLUE, size=9, height=16)
    for i in range(len(REGIONS)):
        r, src = FT + 2 + i, DF["reg_first"] + i
        put(ws, f"B{r}", f"={DFQ}!$A${src}", fnt=font(True, "000000", 9), border=BOTTOM)
        put(ws, f"C{r}", f"={DFQ}!$G${src}", fnt=font(False, "000000", 9), border=BOTTOM, merge_to=f"D{r}")
        put(ws, f"E{r}", f"={DFQ}!$H${src}", fnt=font(False, "000000", 9), border=BOTTOM, align=CENTER)
        put(ws, f"F{r}", f"={DFQ}!$I${src}", fnt=font(True, "000000", 9), border=BOTTOM, align=CENTER, merge_to=f"G{r}")
        put(ws, f"H{r}", f"={DFQ}!$K${src}", fnt=font(False, GREY_TXT, 9), border=BOTTOM, align=CENTER, numfmt="dd/mm/yy", merge_to=f"I{r}")
    status_cf(ws, f"F{FT + 2}:F{FT + 1 + len(REGIONS)}")
    light_title(ws, FT, "How it works", "K", "Q")
    notes = ["Cream cells are inputs. Everything else updates from the region tabs, the Status Log and the GPS tab.",
             "Status headline = newest Status Log entry. Pitch add-ons stack; chips light up when ticked and show this week's GPS.",
             "Tick regions to show them; each region's tests stack under a blue band with its phase and cleared count.",
             "LSI = injured ÷ uninjured side (can exceed 100%). Δ prev = change since the previous test of that metric.",
             "Exit criteria evaluate live on each region tab; 'What's open' lists what's left in the current phase.",
             "Example rows (Knee, Hip, GPS log, Status Log) are flagged in grey — overwrite them."]
    for i, t in enumerate(notes):
        put(ws, f"K{FT + 1 + i}", "•  " + t, fnt=font(False, GREY_TXT, 8), border=None, merge_to=f"Q{FT + 1 + i}")
        ws.row_dimensions[FT + 1 + i].height = 22
    return ws


# ====================================================================== build
build_lists()
for reg in REGIONS: build_region(reg)
build_gps()
build_status_log()
build_chart_feed()
add_gps_charts()
build_dash_feed()
build_dashboard()
wb._sheets = [wb[n] for n in ["Dashboard", "Status Log"] + REGIONS + ["GPS", "Lists", "Dash Feed", "Chart Feed"]]
wb.active = 0
for n in ("Dash Feed", "Chart Feed"): wb[n].sheet_state = "hidden"
wb.save(OUT)
print("saved", OUT)
