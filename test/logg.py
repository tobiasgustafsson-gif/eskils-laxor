import asyncio
src=open('/home/claude/test/app.py').read().split('async def main():')[0]; ns={}; exec(src,ns)
from playwright.async_api import async_playwright
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844}); await ctx.route('**/rest/v1/rpc/*',ns['fake']); await ctx.route('https://cdn.jsdelivr.net/**',ns['cdn'])
    pg=await ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    await pg.goto(f"http://127.0.0.1:8773/?k={ns['KEY']}"); await pg.wait_for_timeout(1500)
    for i in range(4): await pg.click(f'[data-del="v47-svenska#{i}"]'); await pg.wait_for_timeout(100)
    print('svenska klar automatiskt:', await pg.evaluate("S.bockar['v47-svenska']"))
    await pg.click('[data-logg="v47-glosor"]'); await pg.click('#lf-v47-glosor [data-v="Skrivit glosorna"]'); await pg.click('#lf-v47-glosor [data-m="20"]')
    await pg.screenshot(path='/home/claude/test/l-form.png',full_page=True)
    await pg.click('#ls-v47-glosor'); await pg.wait_for_timeout(2200)
    await pg.screenshot(path='/home/claude/test/l-home.png',full_page=True)
    print('db logg:', list(ns['DB']['logg'].values()), 'bockar:', ns['DB']['bockar'])
    await pg.evaluate("location.hash='oversikt'"); await pg.wait_for_timeout(600)
    await pg.screenshot(path='/home/claude/test/l-oversikt.png',full_page=True)
    await pg.reload(); await pg.wait_for_timeout(1200)
    print('efter omladdning:', (await pg.inner_text('#app'))[:120].replace('\n',' | '))
    print('fel:',errs); await b.close()
asyncio.run(main())
