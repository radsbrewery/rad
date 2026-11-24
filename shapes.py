#!/usr/bin/env python3
"""Calculate volume, surface area and size of common 3D objects.

Usage:
    python3 shapes.py                       # interactive menu
    python3 shapes.py cube 3
    python3 shapes.py cuboid 2 3 4 --unit cm
    python3 shapes.py cylinder 1.5 10 --unit m
    python3 shapes.py --list                # show shapes and their parameters
"""

import argparse
import math
import sys

# Each shape: (parameter names, function returning dict of results).
# Results: volume, surface area, and bounding box size (width x depth x height).


def cube(a):
    return {
        "volume": a ** 3,
        "surface": 6 * a ** 2,
        "size": (a, a, a),
        "extra": {"space diagonal": a * math.sqrt(3)},
    }


def cuboid(length, width, height):
    l, w, h = length, width, height
    return {
        "volume": l * w * h,
        "surface": 2 * (l * w + l * h + w * h),
        "size": (l, w, h),
        "extra": {"space diagonal": math.sqrt(l ** 2 + w ** 2 + h ** 2)},
    }


def sphere(radius):
    r = radius
    return {
        "volume": 4 / 3 * math.pi * r ** 3,
        "surface": 4 * math.pi * r ** 2,
        "size": (2 * r, 2 * r, 2 * r),
        "extra": {"diameter": 2 * r},
    }


def hemisphere(radius):
    r = radius
    return {
        "volume": 2 / 3 * math.pi * r ** 3,
        "surface": 3 * math.pi * r ** 2,  # curved 2πr² + flat base πr²
        "size": (2 * r, 2 * r, r),
        "extra": {},
    }


def cylinder(radius, height):
    r, h = radius, height
    return {
        "volume": math.pi * r ** 2 * h,
        "surface": 2 * math.pi * r * (r + h),
        "size": (2 * r, 2 * r, h),
        "extra": {"side area": 2 * math.pi * r * h},
    }


def cone(radius, height):
    r, h = radius, height
    slant = math.sqrt(r ** 2 + h ** 2)
    return {
        "volume": math.pi * r ** 2 * h / 3,
        "surface": math.pi * r * (r + slant),
        "size": (2 * r, 2 * r, h),
        "extra": {"slant height": slant},
    }


def pyramid(base_length, base_width, height):
    l, w, h = base_length, base_width, height
    # Slant heights of the triangular faces (rectangular right pyramid)
    s_l = math.sqrt(h ** 2 + (w / 2) ** 2)  # faces on the length sides
    s_w = math.sqrt(h ** 2 + (l / 2) ** 2)  # faces on the width sides
    return {
        "volume": l * w * h / 3,
        "surface": l * w + l * s_l + w * s_w,
        "size": (l, w, h),
        "extra": {"slant height (length faces)": s_l,
                  "slant height (width faces)": s_w},
    }


def triangular_prism(a, b, c, length):
    # a, b, c = sides of the triangular cross-section; length = prism length
    s = (a + b + c) / 2
    area_sq = s * (s - a) * (s - b) * (s - c)
    if area_sq <= 0:
        raise ValueError("sides a, b, c do not form a valid triangle")
    tri = math.sqrt(area_sq)
    height = 2 * tri / a  # triangle height measured to side a
    return {
        "volume": tri * length,
        "surface": 2 * tri + (a + b + c) * length,
        "size": (a, height, length),
        "extra": {"triangle area": tri, "triangle height (to side a)": height},
    }


def ellipsoid(a, b, c):
    # a, b, c = semi-axes. Surface uses Knud Thomsen's approximation (~1% error).
    p = 1.6075
    surf = 4 * math.pi * ((a ** p * b ** p + a ** p * c ** p + b ** p * c ** p) / 3) ** (1 / p)
    return {
        "volume": 4 / 3 * math.pi * a * b * c,
        "surface": surf,
        "size": (2 * a, 2 * b, 2 * c),
        "extra": {"note": "surface area is an approximation"},
    }


def torus(major_radius, minor_radius):
    R, r = major_radius, minor_radius
    return {
        "volume": 2 * math.pi ** 2 * R * r ** 2,
        "surface": 4 * math.pi ** 2 * R * r,
        "size": (2 * (R + r), 2 * (R + r), 2 * r),
        "extra": {"hole diameter": max(0.0, 2 * (R - r))},
    }


SHAPES = {
    "cube": (["side"], cube),
    "cuboid": (["length", "width", "height"], cuboid),
    "sphere": (["radius"], sphere),
    "hemisphere": (["radius"], hemisphere),
    "cylinder": (["radius", "height"], cylinder),
    "cone": (["radius", "height"], cone),
    "pyramid": (["base_length", "base_width", "height"], pyramid),
    "prism": (["side_a", "side_b", "side_c", "length"], triangular_prism),
    "ellipsoid": (["semi_axis_a", "semi_axis_b", "semi_axis_c"], ellipsoid),
    "torus": (["major_radius", "minor_radius"], torus),
}


def fmt(x):
    return f"{x:,.4f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)


def report(shape, values, unit):
    params, func = SHAPES[shape]
    if any(v <= 0 for v in values):
        raise ValueError("all dimensions must be positive")
    res = func(*values)
    u = f" {unit}" if unit else ""
    w, d, h = res["size"]
    print(f"\n== {shape.upper()} ==")
    for name, v in zip(params, values):
        print(f"  {name:<28}{fmt(v)}{u}")
    print("  " + "-" * 40)
    print(f"  {'volume':<28}{fmt(res['volume'])}{u}{'³' if unit else ''}")
    print(f"  {'surface area':<28}{fmt(res['surface'])}{u}{'²' if unit else ''}")
    print(f"  {'size (W x D x H)':<28}{fmt(w)} x {fmt(d)} x {fmt(h)}{u}")
    for k, v in res["extra"].items():
        val = v if isinstance(v, str) else f"{fmt(v)}{u}{'²' if 'area' in k and unit else ''}"
        print(f"  {k:<28}{val}")
    if unit in ("cm", "mm", "m"):
        litres = res["volume"] * {"mm": 1e-6, "cm": 1e-3, "m": 1e3}[unit]
        print(f"  {'capacity':<28}{fmt(litres)} L")
    print()


def list_shapes():
    print("Available shapes:")
    for name, (params, _) in SHAPES.items():
        print(f"  {name:<12} {' '.join(params)}")


def ask_float(prompt):
    while True:
        try:
            v = float(input(prompt).replace(",", "."))
            if v > 0:
                return v
            print("  Please enter a positive number.")
        except ValueError:
            print("  Not a number, try again.")


def interactive():
    names = list(SHAPES)
    unit = input("Unit (e.g. cm, m, mm — leave empty for none): ").strip()
    while True:
        print()
        for i, n in enumerate(names, 1):
            print(f"  {i:>2}. {n}")
        print("   0. quit")
        choice = input("Choose a shape: ").strip().lower()
        if choice in ("0", "q", "quit", "exit", ""):
            return
        shape = names[int(choice) - 1] if choice.isdigit() and 0 < int(choice) <= len(names) else choice
        if shape not in SHAPES:
            print("  Unknown shape.")
            continue
        values = [ask_float(f"  {p}: ") for p in SHAPES[shape][0]]
        try:
            report(shape, values, unit)
        except ValueError as e:
            print(f"  Error: {e}")


def main():
    ap = argparse.ArgumentParser(description="Volume, surface area and size of 3D objects.")
    ap.add_argument("shape", nargs="?", help="shape name (see --list)")
    ap.add_argument("values", nargs="*", type=float, help="dimensions")
    ap.add_argument("--unit", default="", help="length unit, e.g. cm, m, mm")
    ap.add_argument("--list", action="store_true", help="list shapes and parameters")
    args = ap.parse_args()

    if args.list:
        list_shapes()
        return
    if not args.shape:
        interactive()
        return

    shape = args.shape.lower()
    if shape not in SHAPES:
        sys.exit(f"Unknown shape '{args.shape}'. Use --list to see options.")
    params = SHAPES[shape][0]
    if len(args.values) != len(params):
        sys.exit(f"{shape} needs {len(params)} value(s): {' '.join(params)}")
    try:
        report(shape, args.values, args.unit)
    except ValueError as e:
        sys.exit(f"Error: {e}")


if __name__ == "__main__":
    main()
