"""Exercise the actual website in Chromium (requires Playwright)."""
from pathlib import Path
from tempfile import TemporaryDirectory
from playwright.sync_api import sync_playwright, expect

site = Path(__file__).resolve().parents[1]
with sync_playwright() as playwright, TemporaryDirectory() as temp:
    browser = playwright.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, device_scale_factor=1)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto((site / 'index.html').as_uri())
    expect(page.locator('#node-count')).to_have_text('2151')
    expect(page.locator('#edge-count')).to_have_text('2034')
    expect(page.locator('#row-count')).to_have_text('2077')
    expect(page.locator('#paper-count')).to_have_text('31')
    expect(page.locator('.type-row')).to_have_count(16)
    page.wait_for_timeout(3500)
    page.screenshot(path='/tmp/kg-viewer-desktop.png', full_page=True)
    page.locator('#search').fill('plasma')
    assert page.locator('.search-result').count() > 0
    page.locator('.search-result').first.click()
    expect(page.locator('.entity-title')).to_be_visible()
    expect(page.locator('.relation-card').first).to_be_visible()
    page.locator('.focus-button').click()
    assert int(page.locator('#node-count').inner_text()) < 2151
    page.locator('#reset').click()
    page.locator('#no-types').click()
    expect(page.locator('#node-count')).to_have_text('0')
    expect(page.locator('#empty')).to_be_visible()
    page.locator('#all-types').click()
    expect(page.locator('#node-count')).to_have_text('2151')
    page.locator('#source').select_option(index=1)
    expect(page.locator('#paper-count')).to_have_text('1')
    assert int(page.locator('#row-count').inner_text()) < 2077
    page.locator('#reset').click()
    page.locator('#predicate').select_option('has_property')
    page.locator('#table-tab').click()
    assert page.locator('#triples-body tr').count() > 0
    for cell in page.locator('#triples-body td:nth-child(2)').all():
        assert cell.inner_text() == 'has_property'
    page.locator('#triples-body td:last-child button').first.click()
    expect(page.locator('.entity-title')).to_have_text('has_property')
    page.locator('.relation-card summary').click()
    expect(page.locator('.evidence').first).to_be_visible()
    expect(page.locator('.evidence').first).to_contain_text('Block')
    with page.expect_download() as download:
        page.locator('#export').click()
    assert download.value.suggested_filename == 'knowledge-graph-view.csv'
    fixture = Path(temp) / 'fixture.csv'
    fixture.write_text('subject_text,subject_type,predicate,object_text,object_type,confidence_score\n"argon, gas",Medium,has,electron,Plasma Species,0.9\n"argon, gas",Medium,has,electron,Plasma Species,0.8\nelectron,Plasma Species,loops,electron,Plasma Species,1\n"<img src=x onerror=alert(1)>",Medium,test,electron,Plasma Species,1\n', encoding='utf-8')
    page.locator('#file-input').set_input_files(fixture)
    expect(page.locator('#node-count')).to_have_text('3')
    expect(page.locator('#edge-count')).to_have_text('3')
    expect(page.locator('#row-count')).to_have_text('4')
    assert page.locator('#triples-body img').count() == 0
    json_fixture = Path(temp) / 'fixture.json'
    json_fixture.write_text('[{"subject":"argon","subject_type":"PlasmaMedium","relation":"medium","object":"plasma","object_type":"PlasmaSource","confidence":0.9,"evidence":"argon plasma","source_file":"new-paper.txt","block_index":0}]', encoding='utf-8')
    page.locator('#file-input').set_input_files(json_fixture)
    expect(page.locator('#node-count')).to_have_text('2')
    expect(page.locator('#row-count')).to_have_text('1')
    page.locator('#file-input').set_input_files(fixture)
    page.locator('#graph-tab').click()
    page.wait_for_timeout(500)
    page.locator('#pause').click()
    expect(page.locator('#pause')).to_have_text('Resume')
    page.locator('#zoom-in').click()
    page.locator('#fit').click()
    invalid = Path(temp) / 'invalid.csv'
    invalid.write_text('subject_text\nbroken\n')
    page.locator('#file-input').set_input_files(invalid)
    expect(page.locator('#notice')).to_contain_text('missing columns')
    expect(page.locator('#node-count')).to_have_text('3')
    page.locator('#restore').click()
    expect(page.locator('#node-count')).to_have_text('2151')
    page.set_viewport_size({'width':390,'height':844})
    page.screenshot(path='/tmp/kg-viewer-mobile.png',full_page=True)
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.locator('#search').fill('electron')
    page.locator('.search-result').first.click()
    expect(page.locator('#details')).to_be_visible()
    page.locator('#close-details').click()
    expect(page.locator('#details')).not_to_be_visible()
    assert not errors, errors
    browser.close()
    print('Browser checks passed: bundled data, filters, search, inspector, neighbourhood, table, export, imports, validation, mobile, and no JavaScript errors.')
