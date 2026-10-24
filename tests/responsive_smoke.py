"""Check themes, scalable layouts, and resize controls with real browser input."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

site = Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1920, 'height': 1080})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((site / 'index.html').as_uri())
    expect(page.locator('html')).to_have_attribute('data-theme', 'light')
    page.locator('#theme-toggle').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    page.reload()
    expect(page.locator('html')).to_have_attribute('data-theme', 'dark')
    page.locator('#theme-toggle').click()
    expect(page.locator('html')).to_have_attribute('data-theme', 'light')
    # Actual pointer drags on both dividers, plus keyboard/reset controls.
    for side, panel, delta in [('left', '#filters', 90), ('right', '#details', -90)]:
        handle = page.locator('#resize-' + side)
        before = page.locator(panel).bounding_box()['width']
        box = handle.bounding_box()
        page.mouse.move(box['x'] + box['width']/2, box['y'] + 100)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width']/2 + delta, box['y'] + 100, steps=8)
        page.mouse.up()
        assert page.locator(panel).bounding_box()['width'] > before + 60
        handle.focus()
        handle.press('ArrowRight' if side == 'left' else 'ArrowLeft')
        assert page.locator(panel).bounding_box()['width'] > before + 80
        page.reload()
        assert page.locator(panel).bounding_box()['width'] > before + 80
        handle.focus()
        handle.press('Home')
        assert abs(page.locator(panel).bounding_box()['width'] - before) < 2
    sizes = [(390,844),(768,1024),(1024,768),(1200,1600),(1366,768),(1920,1080),(2560,1440),(3440,1440),(3840,2160)]
    fonts = {}
    for width, height in sizes:
        page.set_viewport_size({'width': width, 'height': height})
        page.wait_for_timeout(150)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, height)
        assert page.locator('#graph').bounding_box()['width'] > min(width*.4, 280), (width,height)
        fonts[width] = page.locator('.type-row').first.evaluate('(e)=>parseFloat(getComputedStyle(e).fontSize)')
        if width > 1100 and width > height:
            expect(page.locator('#resize-right')).to_be_visible()
        else:
            expect(page.locator('#resize-right')).not_to_be_visible()
    assert fonts[2560] > fonts[1366] + 3, fonts
    page.set_viewport_size({'width':1920,'height':1080})
    page.locator('#search').fill('electron')
    page.locator('.search-result').first.click()
    page.locator('.focus-button').click()
    page.wait_for_timeout(2500)
    page.locator('#fit').click()
    page.screenshot(path='/tmp/kg-responsive-light.png',full_page=True)
    page.locator('#theme-toggle').click()
    page.screenshot(path='/tmp/kg-responsive-dark.png',full_page=True)
    expect(page.locator('.entity-title')).to_be_visible()
    page.set_viewport_size({'width':390,'height':844})
    expect(page.locator('#details')).to_be_visible()
    page.locator('#close-details').click()
    expect(page.locator('#details')).not_to_be_visible()
    page.locator('#theme-toggle').click()
    page.screenshot(path='/tmp/kg-responsive-mobile.png',full_page=True)
    assert not errors, errors
    browser.close()
    print('PASS: light default, theme persistence, pointer/keyboard panel resizing, saved widths, portrait/mobile layouts, and scaling through 4K. Type font sizes:', fonts)
