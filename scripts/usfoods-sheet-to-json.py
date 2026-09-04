#!/usr/bin/env python3
"""Turn a US Foods "Sheet to Shelf" export into an order-guide seed for the app.

    python3 scripts/usfoods-sheet-to-json.py Flowood_Sheet_to_Shelf.csv > src/data/usfoods-guide-flowood.json

Then bump that store's stamp in src/lib/guide.ts (USFOODS_SHEETS) so devices
that seeded the previous sheet re-seed from this one.

What it keeps: the sheet's walk order and its group names, the product number,
the description exactly as US Foods spells it (the app tidies the case when it
registers the item, so the spelling here has to stay what the invoice says or
the two stop matching), brand, pack size, case price and unit.

What it changes: a trailing "-New" on a group name — US Foods' mark for a
regrouped sheet, not part of the name — is dropped, and "ToGo" is written
"To Go". A product number that appears twice keeps its first line. The USF
class maps onto the app's categories: DISPOSABLES → Paper / Supply; CHEMICALS
and EQUIPMENT → Kitchen; everything else → Food.
"""
import csv
import json
import re
import sys


def category(usf_class: str) -> str:
    c = usf_class.upper()
    if 'DISPOSABLE' in c:
        return 'Paper / Supply'
    if 'CHEMICAL' in c or 'EQUIPMENT' in c:
        return 'Kitchen'
    return 'Food'


def group_name(raw: str) -> str:
    g = re.sub(r'-New$', '', raw.strip())
    return 'To Go' if g == 'ToGo' else g


def convert(path: str) -> list[dict]:
    rows: list[dict] = []
    seen: set[str] = set()
    with open(path, newline='', encoding='utf-8-sig') as fh:
        for r in csv.DictReader(fh):
            code = r['Product Number'].strip()
            if not code or code in seen:
                continue
            seen.add(code)
            rows.append({
                'group': group_name(r['Group Name']),
                'code': code,
                'name': r['Product Description'].strip(),
                'brand': r['Product Brand'].strip(),
                'size': r['Product Package Size'].strip(),
                'price': float(r['Product Price'].replace('$', '').replace(',', '').strip() or 0),
                'uom': r['Product UOM'].strip(),
                'category': category(r['USF Class Description']),
            })
    return rows


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = convert(sys.argv[1])
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write('\n')
    groups = []
    for row in out:
        if row['group'] not in groups:
            groups.append(row['group'])
    print(f"{len(out)} lines · {' → '.join(groups)}", file=sys.stderr)
