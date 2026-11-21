"""Smoke test: plays one full load cycle at iPad landscape size.

Setup (once):  pip install playwright  &&  playwright install chromium
Run:           python tests/smoke_test.py
Screenshots land in tests/screenshots/.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(__file__).resolve().parent / "screenshots"

DRAG = """([wx,wy])=>{const c=document.getElementById('c');const s=Math.min(innerWidth/1100,innerHeight/620);
const ox=(innerWidth-1100*s)/2,oy=(innerHeight-620*s)/2,x=ox+wx*s,y=oy+wy*s;
for(const t of ['pointerdown','pointerup'])c.dispatchEvent(new PointerEvent(t,{clientX:x,clientY:y,pointerId:5,bubbles:true}));}"""

async def main():
    SHOTS.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await (await browser.new_context(viewport={"width": 1180, "height": 820},
                                                device_scale_factor=2, has_touch=True, is_mobile=True)).new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.goto((ROOT / "index.html").as_uri())
        await page.wait_for_timeout(600)
        await page.screenshot(path=str(SHOTS / "0_intro.png"))
        await page.click("[data-act=close]")
        await page.wait_for_timeout(5000)            # truck arrives and dumps
        await page.tap("#power")
        await page.wait_for_timeout(2500)            # startup horn
        for cycle in range(3):
            rock = await page.evaluate("()=>{const rs=window.__cs.rocks.filter(r=>r.r>=15&&r.x<390&&!r.held);"
                                       "rs.sort((a,b)=>b.x-a.x);return rs[0]?{x:rs[0].x,y:rs[0].y,r:rs[0].r}:null}")
            if not rock:
                break
            await page.evaluate(DRAG, [rock["x"], rock["y"] - rock["r"] * 0.45])
            await page.wait_for_timeout(2200)
            await page.tap("#grab")
            held = await page.evaluate("()=>!!window.__cs.arm.held")
            print(f"cycle {cycle}: grabbed={held}")
            await page.evaluate(DRAG, [705, 200])       # over the crusher hopper
            await page.wait_for_timeout(2500)
            await page.tap("#grab")
            await page.wait_for_timeout(2500)
        await page.wait_for_timeout(9000)
        state = await page.evaluate("()=>({dust:window.__cs.jobDust,power:window.__cs.power.state,rocks:window.__cs.rocks.length})")
        await page.screenshot(path=str(SHOTS / "1_after.png"))
        await browser.close()
    print("state:", state)
    print("errors:", errors or "none")
    ok = state["dust"] > 0 and state["power"] != "tripped" and not errors
    print("PASS" if ok else "FAIL")
    raise SystemExit(0 if ok else 1)

asyncio.run(main())
