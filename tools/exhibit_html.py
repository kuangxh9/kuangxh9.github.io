"""The 琴棋書畫 collection on the About page.

Every room shares one structure: a bilingual title line (the Traditional
Chinese title, then the English title over its maker and date, and any
switch), the work itself on a plate of one fixed height, and a label beneath.
All rooms are stacked in one grid cell, so changing room never changes the
height of the page: only the work and its label change.
Rooms are only emitted when their material exists."""

def head(zh, title, maker, extra=''):
    return f'''          <header class="room-head">
            <h3 class="rh-zh" lang="zh-Hant">{zh}</h3>
            <div class="rh-en"><p class="rh-title">{title}</p><p class="rh-maker">{maker}</p></div>
            {extra}
          </header>'''

def switch(pairs, current):
    return '<p class="rh-switch">' + ''.join(
        f'<button type="button" class="ctl" data-instrument="{rid}" aria-pressed="{str(rid == current).lower()}">{label}</button>' for rid, label in pairs) + '</p>'

SOUND = ('<button type="button" class="sound-btn" data-sound aria-pressed="false">'
         '<svg viewBox="0 0 16 16" aria-hidden="true"><path class="spk" d="M2 6h2.6L8 3v10L4.6 10H2z"/><path class="wave" d="M10.4 5.6a3.4 3.4 0 0 1 0 4.8M12.2 3.8a6 6 0 0 1 0 8.4"/><path class="off" d="M10.5 6l4 4m0-4l-4 4"/></svg>'
         '<span data-sound-label>Sound off</span></button>')

def transport():
    return ('<div class="transport tnum"><button type="button" class="play" data-act="play" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span><span data-play-label>Play</span></button>'
            '<span class="scrub" data-act="seek" role="slider" tabindex="0" aria-label="Position in the piece" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span class="scrub-fill"></span></span>'
            '<span class="time"><b data-out="time">0:00</b> / <span data-out="total">0:00</span></span>'
            '<span class="bar">Bar <b data-out="bar">1</b></span>' + SOUND + '</div>'
            '<p class="sound-state" data-out="sound" aria-live="polite"></p>')

def label(text, credit, aside=''):
    """a museum label: what the work is and why it matters, then its source"""
    return f'''          <footer class="room-foot">
            <div class="label"><p class="label-text">{text}</p><p class="label-credit">{credit}</p></div>
            <div class="rf-ctl">{aside}</div>
          </footer>'''

def exhibit(have):
    tabs = [('qin', '琴', 'Music', '鋼琴　吉他'), ('qi', '棋', 'Go', '圍棋'), ('shu', '書', 'Calligraphy', '書法'), ('hua', '畫', 'Painting', '水墨畫')]
    tab_html = '\n'.join(f'''        <button type="button" class="ex-tab" role="tab" id="tab-{i}" data-chapter="{i}" aria-controls="ch-{i}" aria-selected="false" tabindex="-1">
          <span class="ex-ch" lang="zh-Hant">{zh}</span><span class="ex-en"><b>{en}</b><small lang="zh-Hant">{sub}</small></span>
        </button>''' for i, zh, en, sub in tabs)

    # ---- 琴
    inst = [('room-piano', '鋼琴 Piano'), ('room-guitar', '吉他 Guitar')]
    qin = f'''      <div class="ex-chapter" id="ch-qin" role="tabpanel" aria-labelledby="tab-qin" data-chapter-panel="qin">
        <article class="room" id="room-piano" data-room="piano" data-src="clair.json">
{head('月光', 'Clair de lune', 'Claude Debussy, <i>Suite bergamasque</i>, published 1905', switch(inst, 'room-piano'))}
          <div class="plate music-plate"><canvas tabindex="0" role="img" aria-label="Clair de lune as falling notes: each note descends toward its key on a piano keyboard and sounds as it arrives."></canvas></div>
{label('Each note falls toward its key and sounds as it arrives: its length is how long it is held, its depth of tone how firmly it is played. The melody is drawn in blue, the accompaniment in ink.', 'Score: Mutopia Project, ed. Keith OHara, public domain. Piano samples: tonejs-instruments, CC BY 3.0', transport())}
        </article>
        <article class="room" id="room-guitar" data-room="guitar" data-src="recuerdos.json">
{head('阿爾罕布拉宮的回憶', 'Recuerdos de la Alhambra', 'Francisco Tárrega, 1896', switch(inst, 'room-guitar'))}
          <div class="plate music-plate"><canvas tabindex="0" role="img" aria-label="Recuerdos de la Alhambra played on a drawn classical guitar: fingertips press the computed frets, plucked strings vibrate, and the tremolo runs along the treble strings."></canvas></div>
{label('A study in tremolo: the thumb plays the bass while three fingers repeat each melody note, so one line seems to sustain. Each pluck runs along its string toward the fret, and the sounding length vibrates. The fingering shown is computed from the notes by a simple model of the left hand; it is not Tárrega’s own.', 'Score: Mutopia Project, ed. Stewart Holmes, CC BY-SA 3.0. Guitar samples: tonejs-instruments, CC BY 3.0', transport())}
        </article>
      </div>'''

    # ---- 棋
    games = []
    if have.get('lee'):
        games.append(('room-lee', '2016', 'go-lee-sedol-alphago-4.json', '人機大戰　第四局', 'Lee Sedol vs AlphaGo, game four', 'Seoul, 13 March 2016. Lee Sedol, White, wins by resignation',
                      'AlphaGo had won the first three games. On move 78 Lee Sedol played a wedge the program had judged most unlikely; this became the only game a human won in the match.', 78))
    if have.get('shusaku'):
        games.append(('room-shusaku', '1846', 'go-shusaku-gennan-1846.json', '耳赤之局', 'The ear-reddening game', 'Osaka, 1846. Honinbo Shusaku, Black, wins by two points',
                      'Seventeen-year-old Shusaku against Inoue Gennan Inseki. After move 127 a doctor watching noticed Gennan’s ears flush red, and took it as the moment the game turned.', 127))
    pairs = [(g[0], g[1]) for g in games]
    qi_rooms = []
    for i, (rid, yr, src, zh, title, maker, story, key) in enumerate(games):
        ctl = ('<div class="transport tnum"><button type="button" class="play" data-go-act="play" aria-pressed="false"><span class="play-icon" aria-hidden="true"></span><span data-play-label>Play</span></button>'
               '<button type="button" class="ctl" data-go-act="prev">Back</button><button type="button" class="ctl" data-go-act="next">Forward</button>'
               f'<button type="button" class="ctl" data-go-act="key">Move {key}</button><span class="time">Move <b data-go-out="move">0</b></span>' + SOUND + '</div>')
        qi_rooms.append(f'''        <article class="room go-room" id="{rid}" data-room="go" data-go data-src="../assets/art/{src}">
{head(zh, title, maker, switch(pairs, rid) if len(games) > 1 else '')}
          <div class="plate"><canvas tabindex="0" role="img" aria-label="{title}, replayed move by move with each side's influence painted as ink wash. Arrow keys step through the moves."></canvas>
            <div class="go-side" data-go-side><p class="go-story">{story}</p><p class="go-note" data-go-note aria-live="polite"></p></div></div>
{label('', 'Game record: A. Brouwer’s go archive', ctl)}
        </article>''')
    qi = f'''      <div class="ex-chapter" id="ch-qi" role="tabpanel" aria-labelledby="tab-qi" data-chapter-panel="qi">
{chr(10).join(qi_rooms)}
      </div>'''

    def scroll_room(rid, a, zh, title, maker, text, credit, drift):
        long_ = a['w'] / a['h'] > 6
        mini = (f'''          <div class="minimap" aria-hidden="true" style="aspect-ratio:{a['w']}/{a['h']}"><img src="../assets/art/{a['file']}" alt="" loading="lazy" decoding="async" draggable="false"><span class="mini-window"></span></div>\n''' if long_ else '')
        return f'''        <article class="room scroll-room{' is-long' if long_ else ''}" id="{rid}" data-room="scroll" data-drift="{'true' if drift else 'false'}">
{head(zh, title, maker)}
          <div class="plate scroll-plate" tabindex="0" role="img" aria-label="{title}. Drag, or use the arrow keys, to move along the scroll; hover for a closer look.">
            <div class="scroll-strip"><img src="../assets/art/{a['file']}" width="{a['w']}" height="{a['h']}" alt="" loading="lazy" decoding="async" draggable="false"></div>
            <div class="lens" aria-hidden="true"></div>
          </div>
{mini}{label(text, credit, '<p class="rf-hint">' + ('Drag to unroll, or use the strip above. ' if long_ else '') + 'Hover to look closely.</p>')}
        </article>'''
    shu = hua = ''
    if have.get('lanting'):
        shu = f'''      <div class="ex-chapter" id="ch-shu" role="tabpanel" aria-labelledby="tab-shu" data-chapter-panel="shu">
{scroll_room('room-lanting', have['lanting'], '蘭亭集序', 'Preface to the Orchid Pavilion Poems', 'Wang Xizhi, 353; Tang dynasty tracing copy',
             'Wang Xizhi’s own sheet, written at a spring gathering in 353, has not survived. This tracing, the Shenlong copy traditionally attributed to Feng Chengsu at the Tang court, is generally held to be the closest to his hand: it keeps even his corrections.',
             'Palace Museum, Beijing. Public domain, via Wikimedia Commons', False)}
      </div>'''
    if have.get('fuchun'):
        hua = f'''      <div class="ex-chapter" id="ch-hua" role="tabpanel" aria-labelledby="tab-hua" data-chapter-panel="hua">
{scroll_room('room-fuchun', have['fuchun'], '富春山居圖', 'Dwelling in the Fuchun Mountains', 'Huang Gongwang, 1347–1350; the Master Wuyong scroll',
             'Huang Gongwang painted the scroll over three or four years, finishing it around the age of eighty. In 1650 a dying collector ordered it burned; his nephew pulled it from the fire in two pieces. The longer, shown here, is in Taipei; the shorter, <i>The Remaining Mountain</i>, is in Hangzhou.',
             'National Palace Museum, Taipei. Public domain, via Wikimedia Commons', True)}
      </div>'''

    return f'''  <section class="exhibit grid" id="practice" data-exhibit data-base="../assets/" aria-labelledby="h-ex">
    <div class="ex-side">
      <h2 class="section-label" id="h-ex">Outside the lab</h2>
      <p class="ex-intro">A classical scholar was expected to practise four arts, <span lang="zh-Hant" class="zh">琴棋書畫</span>: music, Go, calligraphy and painting. They are mine too: piano and guitar, Go, more than fourteen years of calligraphy, and ink-wash painting. Each room holds a masterpiece by someone else, shown as faithfully as a screen allows.</p>
      <div class="ex-tabs" role="tablist" aria-label="Four arts" aria-orientation="vertical">
{tab_html}
      </div>
    </div>
    <div class="ex-rooms">
{qin}
{qi}
{shu}
{hua}
    </div>
  </section>'''
