# Submission — Yugawara Tourism Policy Dashboard

**Challenge area 5: Tourism planning.**
A decision tool for setting the rate of a proposed accommodation tax in Yugawara Town, Kanagawa, Japan,
built from 17 primary statistical series covering 1990–2026.

Intended user: the Tourism Division of Yugawara Town and its Accommodation Tax Study Committee.

---

## What is in this folder

| # | Deliverable | Location | Status |
|---|---|---|---|
| 1 | The published Site | `site/` | included |
| 2 | The collected dataset (CSV) | `data/` | included |
| 3 | Data and methodology note | `methodology-note.txt` | included |
| 4 | Five-minute presentation | `presentation-script.txt` | script included; recording to follow |
| 5 | Short reflection | `reflection.txt` | included |

---

## 1. The Site

Open `site/index.html` in any browser. There is nothing to build and nothing to install:
the page has no external dependencies and the data is bundled into `site/js/data.js`,
so it works from the local file system as well as over HTTP.

To serve it locally instead:

```bash
python3 -m http.server 4173 --directory site
```
Yugawara Town, Kanagawa, Japan is considering an accommodation tax. The three
numbers that decision turns on - how fast the tax base is shrinking, how much
each rate would raise, and how that compares with today's tourism budget - sit
in separate statistical publications and cannot be read side by side. The
dashboard puts all three on one screen so that a rate can actually be chosen,
and adds the evidence for how the revenue should then be spent.

Intended user: the Tourism Division of Yugawara Town and its Accommodation Tax
Study Committee.

### Sections

| Tab | Contents |
|---|---|
| 1. Decide | An accommodation tax simulator: tax per night or percentage of room rate, share of nights taxed, collection cost and visitor scenario. Revenue estimate, comparison against the town's tourism budget, sensitivity table and four recommendations, all recomputed live. |
| 2. Why it is needed | Six KPI tiles, seven key findings, an indexed comparison on a single axis, and six charts breaking the structure apart. |
| 3. What to spend it on | Seasonality heatmap, monthly overnight/day split, measured weekday vs. weekend spend per visitor, and a ranking of sites and events. |
| 4. Data and limitations | How the data was collected, the full source list with links, definitions and units, and an account of what the data cannot prove. |

Every chart carries a hover and keyboard tooltip and a table-view twin ("Table view"),
so no value is reachable only by pointing at it. Line charts can be read with the left and
right arrow keys after tabbing to them. The layout works from 375px upward, and light,
dark and automatic themes are all available from the button in the header.

## 2. The dataset

17 CSV files in `data/`, UTF-8 with BOM so they open directly in Excel and Google Sheets.
The same files are served from `site/data/` for download from within the Site.

Every file carries `source` and `source_url` columns identifying the primary publication
each row came from. Column names and categorical values are in English; place and event
names are romanised, with a short gloss where the original name carries meaning.

| File | Rows | Contents |
|---|---|---|
| `01_visitors_annual.csv` | 22 | Visitors and tourism spending, 1990–2024 |
| `02_visitors_spending_monthly.csv` | 72 | The same, monthly, 2019–2024 |
| `03_visitors_by_site_facility_event_annual.csv` | 78 | By site, facility and event, 2019–2024 |
| `04_jr_yugawara_station_daily_boardings_fy.csv` | 14 | Station boardings, FY2011–FY2024 |
| `05_neighbouring_municipalities_annual.csv` | 45 | Yugawara, Hakone and Manazuru, 2010–2024 |
| `06_lodging_establishments_annual.csv` | 11 | Lodging establishments by type, 2006–2016 |
| `07_visitors_by_event_fy.csv` | 30 | Visitors by event, FY2011–FY2015 |
| `08_town_tourism_budget.csv` | 6 | Town tourism budget and its share of the general account |
| `09_derived_kpis_annual.csv` | 6 | Derived seasonality and mix indicators |
| `10_guest_nights_resas_annual.csv` | 13 | Length of stay and guest demographics, 2013–2025 |
| `11_resas_card_spend_per_visitor_monthly.csv` | 45 | Measured card spend per visitor, weekday/weekend |
| `12_population_households_annual.csv` | 10 | Population and households, 2015–2024 |
| `13_population_by_age_ageing_rate_annual.csv` | 5 | Population by age group and ageing rate |
| `14_household_composition_census2020.csv` | 12 | Household composition, 2020 Census |
| `15_accommodation_food_establishments_2021.csv` | 6 | Establishments and employees, 2021 |
| `15b_accommodation_food_establishments_trend.csv` | 4 | Establishments over time, 2006–2021 |
| `16_establishments_by_employee_size.csv` | 4 | Private establishments by employee size |

All data was retrieved on 2026-09-20 from primary sources only. No secondary citations,
blogs or aggregator sites were used, and nothing in the dataset can identify an individual:
no names, contact details, medical information or precise personal locations.

---

## 3. The data and methodology note

`methodology-note.txt` — plain text, covering the problem and intended user, how
each source was collected, how the figures were verified, the six key findings,
the four recommendations, and a full account of what the data cannot prove.

---

## 4. The presentation

`five-minutes demonstration.mp4` — the five-minute screen recording

---

## 5. The reflection

`reflection.txt` — sorts the Site's own claims by how strongly the data backs
them: what is established, what holds only in direction, and what the data
cannot reach at all.

---

## Three things to read before using the numbers

1. **The prefecture's "tourism spending" is not a measured figure.** It is
   `overnight visitors × ¥10,500 + day visitors × ¥1,080`, an identity that holds with zero
   error for every month and year checked. It carries no information about actual spending
   behaviour. Measured spend per visitor comes from RESAS card data instead, and the two
   must not be compared by level.
2. **The revenue simulator assumes zero price elasticity.** It does not model visitors
   deciding not to come because of the tax, so every figure is an upper bound. The share of
   nights taxed, the collection cost and the average room rate are assumptions the user sets,
   not statistics; they are marked as such in the interface.
3. **Room occupancy and municipal guest-night totals could not be obtained.** Neither is
   published for Yugawara Town. The tax base therefore rests on visitor counts alone and
   cannot be cross-checked from the supply side. The full account is in the Site's
   "Data and limitations" section.
