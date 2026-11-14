import asyncio, json
from playwright.async_api import async_playwright
KEY='testnyckel'
DB={'status':{},'forsok':{},'bockar':{},'logg':{}}
async def fake(route, req):
    fn=req.url.split('/rpc/')[1]; body=json.loads(req.post_data or '{}')
    if body.get('p_nyckel')!=KEY:
        return await route.fulfill(status=401, body='{"code":"28000","message":"fel nyckel"}')
    if fn=='hamta':
        dag={}
        for f in DB['forsok'].values():
            k=(f['ts'][:10],f['laxa'],f['kalla']); r=dag.setdefault(k,{'dag':k[0],'laxa':k[1],'kalla':k[2],'antal':0,'sekunder':0,'ratt':0}); r['antal']+=1; r['sekunder']+=f['sekunder']; r['ratt']+=f['ratt']
        return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'status':list(DB['status'].values()),'bockar':DB['bockar'],'dagar':list(dag.values()),'logg':sorted(DB['logg'].values(),key=lambda x:x['ts'],reverse=True)}))
    if fn=='spara':
        for f in body['p_forsok']: DB['forsok'][f['id']]=f
        for s in body['p_status']: DB['status'][s['item']]=s
        return await route.fulfill(status=200, content_type='application/json', body='1')
    if fn=='logga':
        DB['logg'][body['p_id']]={'id':body['p_id'],'ts':body['p_ts'],'laxa':body['p_laxa'],'text':body['p_text'],'minuter':body['p_minuter']}; return await route.fulfill(status=204, body='')
    if fn=='bocka':
        DB['bockar'][body['p_laxa']]=body['p_klar']; return await route.fulfill(status=204, body='')
NM='/home/claude/europa/node_modules/'
CDN={}
async def cdn(route, req):
    u=req.url
    if 'd3-geo' in u: return await route.fulfill(status=200, content_type='text/javascript', headers={'Access-Control-Allow-Origin':'*'}, body=open('/home/claude/test/cdn/d3-geo.mjs').read())
    if 'topojson-client' in u: return await route.fulfill(status=200, content_type='text/javascript', headers={'Access-Control-Allow-Origin':'*'}, body=open('/home/claude/test/cdn/topojson.mjs').read())
    if 'world-atlas' in u: return await route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=open(NM+'world-atlas/countries-50m.json').read())
    if 'flag-icons' in u: return await route.fulfill(status=200, content_type='image/svg+xml', body=open(NM+'flag-icons/flags/4x3/'+u.split('/')[-1]).read())
    await route.abort()
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    ctx=await b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=2)
    await ctx.route('**/rest/v1/rpc/*',fake)
    await ctx.route('https://cdn.jsdelivr.net/**',cdn)
    await ctx.add_init_script("SpeechSynthesis.prototype.speak=function(u){(window.__said=window.__said||[]).push(u.text)};window.print=()=>{window.__printed=(window.__printed||0)+1}")
    pg=await ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: m.type=='error' and errs.append(m.text))
    await pg.goto('http://127.0.0.1:8770/'); await pg.wait_for_timeout(400)
    print('utan nyckel:', (await pg.inner_text('#app'))[:80].replace('\n',' '))
    await pg.goto('http://127.0.0.1:8770/?k=fel'); await pg.wait_for_timeout(800)
    print('fel nyckel:', 'fel familjenyckel' in await pg.inner_text('#app'))
    await pg.evaluate("localStorage.clear()")
    await pg.goto(f'http://127.0.0.1:8770/?k={KEY}'); await pg.wait_for_timeout(1200)
    await pg.screenshot(path='/home/claude/test/a-home.png',full_page=True)
    await pg.click('[data-chk="v47-svenska"]'); await pg.wait_for_timeout(1800)
    print('bock i db:', DB['bockar'])
    # Europa: dagens övning
    await pg.click('[data-open="v47-europa"]'); await pg.wait_for_timeout(600)
    await pg.screenshot(path='/home/claude/test/a-laxa.png',full_page=True)
    await pg.click('[data-play="ova"][data-sp="land"]'); await pg.wait_for_timeout(800)
    await pg.screenshot(path='/home/claude/test/a-place.png')
    n=0
    for k in range(40):
      if await pg.query_selector('#igen'): break
      t=await pg.evaluate("P.typ")
      if t=='placera':
        wrong = k==2
        await pg.evaluate(f"tryckKarta({'(P.x.i+1)%49' if wrong else 'P.x.i'})")
      await pg.evaluate("clearTimeout(P.timer); if(P.låst) nästa()"); n+=1
    await pg.wait_for_timeout(300)
    await pg.screenshot(path='/home/claude/test/a-klart.png',full_page=True)
    print('efter pass:', (await pg.inner_text('#app'))[:160].replace('\n',' | '))
    await pg.wait_for_timeout(1800)
    print('i db: status', len(DB['status']), 'försök', len(DB['forsok']))
    # simulera nästa dag: flytta datum
    await pg.evaluate("for (const k in S.status){S.status[k].senast_dag='2026-11-13'; S.status[k].due='2026-11-14'}")
    await pg.evaluate("vyLaxa('v47-europa')"); await pg.wait_for_timeout(400)
    await pg.click('[data-play="ova"][data-sp="land"]'); await pg.wait_for_timeout(700)
    print('dag 2 typ:', await pg.evaluate("P.typ"), await pg.evaluate("P.x.namn"))
    await pg.screenshot(path='/home/claude/test/a-namnval.png')
    if await pg.evaluate("P.typ")=='namnval':
        await pg.click(f'.opt[data-j="{await pg.evaluate("P.x.i")}"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/home/claude/test/a-namnval2.png')
    await pg.evaluate("avsluta()")
    # förhör: skriv-läge
    await pg.click('[data-play="forhor"][data-sp="land"]'); await pg.wait_for_timeout(700)
    for k in range(3):
      t=await pg.evaluate("P.typ")
      if t=='namnskriv':
        await pg.fill('#ans', await pg.evaluate("EUROPA.countries[P.x.i].sv.toLowerCase()")); await pg.click('form .primary')
      else:
        await pg.evaluate("tryckKarta(P.x.i)")
      await pg.wait_for_timeout(200)
      if k==0: await pg.screenshot(path='/home/claude/test/a-forhor.png')
      await pg.evaluate("clearTimeout(P.timer); nästa()")
    await pg.evaluate("avsluta()")
    # huvudstäder
    await pg.click('[data-play="ova"][data-sp="stad"]'); await pg.wait_for_timeout(700)
    await pg.screenshot(path='/home/claude/test/a-stad.png')
    await pg.evaluate("avsluta()")
    # papper
    await pg.click('[data-papper="land"]'); await pg.wait_for_timeout(300)
    await pg.click('#blad'); await pg.wait_for_timeout(300)
    await pg.emulate_media(media='print'); await pg.screenshot(path='/home/claude/test/a-print.png',full_page=True); await pg.emulate_media(media='screen')
    btns=await pg.query_selector_all('.tri button.y'); await btns[0].click(); await btns[1].click()
    nb=await pg.query_selector_all('.tri button.n'); await nb[2].click()
    await pg.click('#spara'); await pg.wait_for_timeout(2500)
    print('papper i db:', sum(1 for f in DB['forsok'].values() if f['kalla']=='papper'))
    # glosor
    await pg.evaluate("location.hash='l/v47-glosor'"); await pg.wait_for_timeout(300)
    await pg.click('[data-play="ova"]'); await pg.wait_for_timeout(500)
    await pg.screenshot(path='/home/claude/test/a-glosa.png')
    await pg.click(f'.opt[data-id="{await pg.evaluate("P.x.id")}"]'); await pg.wait_for_timeout(200)
    await pg.evaluate("avsluta()")
    await pg.click('[data-papper="glosor"]'); await pg.click('#blad'); await pg.wait_for_timeout(200)
    await pg.emulate_media(media='print'); await pg.screenshot(path='/home/claude/test/a-print-glosor.png',full_page=True); await pg.emulate_media(media='screen')
    # översikt
    await pg.evaluate("location.hash='oversikt'"); await pg.wait_for_timeout(500)
    await pg.screenshot(path='/home/claude/test/a-oversikt.png',full_page=True)
    print('utskrifter:', await pg.evaluate("window.__printed"), 'tal:', (await pg.evaluate("window.__said||[]"))[:3])
    # ny enhet: läser från db
    pg2=await ctx.new_page(); await pg2.evaluate("1")
    ctx2=await b.new_context(viewport={'width':1280,'height':800}); await ctx2.route('**/rest/v1/rpc/*',fake); await ctx2.route('https://cdn.jsdelivr.net/**',cdn)
    pg3=await ctx2.new_page(); pg3.on('pageerror',lambda e:errs.append(str(e)))
    await pg3.goto(f'http://127.0.0.1:8770/?k={KEY}'); await pg3.wait_for_timeout(1200)
    print('dator ser:', (await pg3.inner_text('#app'))[:300].replace('\n',' | '))
    await pg3.screenshot(path='/home/claude/test/a-dator.png',full_page=True)
    await pg3.evaluate("location.hash='l/v47-europa'"); await pg3.wait_for_timeout(500)
    await pg3.click('[data-play="extra"][data-g="balkan"]',force=True) if await pg3.query_selector('[data-play="extra"][data-g="balkan"]:visible') else None
    print('fel:',errs); await b.close()
asyncio.run(main())
