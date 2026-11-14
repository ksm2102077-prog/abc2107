// 銃・弾薬とキャンペーン任務のデータ
(function (root) {
  'use strict';
  const SN = root.SN = root.SN || {};

  // mv: 15℃での初速(m/s), mvTempCoef: 装薬温度1℃あたりの初速変化
  // bc: G7弾道係数, sightH: 銃身軸とスコープ中心の高さの差(m)
  // disp: 銃と弾の集弾性（MIL、標準偏差）, mvSd: 初速のばらつき（標準偏差 m/s）
  // coldBore: 冷えた銃身の初弾のずれ（MIL、上・右が正）
  SN.RIFLES = [
    {
      id: 'r308', name: '7.62mm ボルトアクション狙撃銃', short: '7.62×51mm',
      ammo: '175gr マッチ弾（M118LR 相当）', barrel: '24インチ銃身・ツイスト1:11.25',
      mv: 792.5, mvTempCoef: 0.55, mvSd: 2.6, bc: 0.243, sightH: 0.0445, zeroRange: 100,
      load: { massGr: 175, diaIn: 0.308, lenIn: 1.24, twistIn: 11.25 },
      disp: 0.06, coldBore: [0.12, 0.05], mag: 5, recoil: 2.6, loud: 1.0,
      maxElev: 30, scope: { min: 5, max: 25 }, sway: 1.0, mass: 7.3,
      note: '扱いやすく反動が小さい。1000mを超えると音速付近まで落ちて弾道が乱れやすい。'
    },
    {
      id: 'r300', name: '.300 マグナム狙撃銃', short: '.300 Win Mag',
      ammo: '220gr マッチ弾（Mk248 Mod1 相当）', barrel: '24インチ銃身・ツイスト1:10',
      mv: 868.7, mvTempCoef: 0.6, mvSd: 3.0, bc: 0.310, sightH: 0.0445, zeroRange: 100,
      load: { massGr: 220, diaIn: 0.308, lenIn: 1.52, twistIn: 10 },
      disp: 0.065, coldBore: [0.15, -0.04], mag: 5, recoil: 3.6, loud: 1.25,
      maxElev: 30, scope: { min: 5, max: 25 }, sway: 1.0, mass: 7.9,
      note: '7.62mmより風に強く、1200m付近まで超音速を保つ。'
    },
    {
      id: 'r338', name: '.338 ラプア・マグナム狙撃銃', short: '.338 LM',
      ammo: '300gr マッチ弾', barrel: '27インチ銃身・ツイスト1:10',
      mv: 820, mvTempCoef: 0.5, mvSd: 2.8, bc: 0.368, sightH: 0.05, zeroRange: 100,
      load: { massGr: 300, diaIn: 0.338, lenIn: 1.70, twistIn: 10 },
      disp: 0.07, coldBore: [0.1, 0.08], mag: 5, recoil: 4.6, loud: 1.5,
      maxElev: 32, scope: { min: 5, max: 25 }, sway: 0.92, mass: 9.5,
      note: '長距離狙撃の主力。1500m前後まで実用的。'
    },
    {
      id: 'r50', name: '12.7mm 対物狙撃銃（ボルト式）', short: '.50 BMG',
      ammo: '750gr マッチ弾', barrel: '29インチ銃身・ツイスト1:15',
      mv: 838, mvTempCoef: 0.45, mvSd: 4.0, bc: 0.524, sightH: 0.065, zeroRange: 100,
      load: { massGr: 750, diaIn: 0.510, lenIn: 2.48, twistIn: 15 },
      disp: 0.1, coldBore: [0.18, 0.1], mag: 5, recoil: 6.5, loud: 2.3,
      maxElev: 35, scope: { min: 5, max: 25 }, sway: 0.75, mass: 13.5,
      note: '重く安定し、風にも強い。発射音と砂ぼこりが大きく、位置がばれやすい。車両や機材も破壊できる。'
    }
  ];
  SN.rifleById = (id) => SN.RIFLES.find(r => r.id === id);

  // 既知の大きさ（ミル測距の参照）
  SN.SIZES = {
    person: { label: '人', text: '身長 約1.7m（肩幅0.45m・頭0.23m）', h: 1.7 },
    drum: { label: 'ドラム缶', text: '高さ0.88m・直径0.58m', h: 0.88 },
    truck: { label: '輸送トラック', text: '全高2.9m・全長7.4m', h: 2.9 },
    pickup: { label: 'ピックアップ', text: '全高1.8m・全長5.3m', h: 1.8 },
    tent: { label: 'テント', text: '高さ2.4m・幅4.0m', h: 2.4 },
    house: { label: '日干しれんがの家', text: '高さ3.0m', h: 3.0 },
    hut: { label: '石積みの小屋', text: '高さ2.5m', h: 2.5 },
    sandbags: { label: '土嚢壁', text: '高さ1.2m', h: 1.2 },
    wall: { label: '土塀', text: '高さ1.4m', h: 1.4 },
    mast: { label: '通信マスト', text: '高さ12m', h: 12 },
    tank: { label: '給水タンク', text: '高さ3.2m（脚を含む）・直径2.0m', h: 3.2 },
    plate: { label: '鉄板標的', text: '幅0.5m・高さ0.7m', h: 0.7 },
    generator: { label: '発電機', text: '高さ1.1m・長さ1.8m（エンジン部 0.6m角）', h: 1.1 },
    stake: { label: '白い標柱', text: '高さ1.0m', h: 1.0 },
    hut2: { label: '射場の小屋', text: '高さ2.4m・幅3.0m', h: 2.4 },
    net: { label: '偽装網', text: '高さ2.6m', h: 2.6 },
    cave: { label: '洞窟の入口', text: '高さ2.6m・幅3.2m', h: 2.6 }
  };

  // 見た目: top 上着, pants ズボン, head 'none'|'turban'|'helmet'|'cap'|'scarf'
  const L = {
    guard: { top: 0x6b6a4a, pants: 0x55553c, head: 'helmet', headColor: 0x4c4f3a, vest: 0x3d4030, item: 'rifle' },
    guard2: { top: 0x8a7b5c, pants: 0x6e6248, head: 'scarf', headColor: 0xc9b99a, vest: 0x4a4434, item: 'rifle', beard: true },
    guard3: { top: 0x5a5e4c, pants: 0x4d4a3e, head: 'cap', headColor: 0x3c3a30, item: 'rifle', beard: true },
    civ: { top: 0xdcd6c8, pants: 0xcfc8b8, head: 'none', item: 'none' },
    civ2: { top: 0x7b5a3f, pants: 0x9c8b72, head: 'cap', headColor: 0xe7e2d6, item: 'none', beard: true },
    elder: { top: 0xe8e4da, pants: 0xe8e4da, head: 'turban', headColor: 0xf2efe6, item: 'none', beard: true }
  };
  SN.LOOKS = L;

  // 任務。座標は「基地中心からの相対位置」[前方du, 右dv]（m）。
  SN.MISSIONS = [
    {
      id: 'm1', name: '乾いた射場', region: 'desert', kind: 'training',
      place: '訓練場・砂漠地帯（北緯31.5°）',
      summary: '鉄板標的4枚。距離は知らされない。ミルで距離を測り、DOPEと風を読んで当てる。',
      brief: [
        '派遣前の最終確認射撃。射場の距離標は撤去されている。',
        '鉄板標的（幅0.5m・高さ0.7m）が4枚、300〜750mの範囲に立っている。観測スコープで鉄板の高さを何ミルか測り、距離＝大きさ(m)×1000÷ミル数 で距離を出すこと。',
        '距離が分かったら、DOPEカードで気象計の密度高度に近い列を読み、エレベーションを回す。風は旗と陽炎で読む。',
        'この任務では敵はいない。警戒度は上がらない。'
      ],
      lat: 31.5, azimuth: 250, sun: { el: 48, az: 160 },
      wx: { alt: 700, tempC: 31, hum: 0.22, windFrom: 300, wind: 2.6, gust: 0.7, zones: [[1, 0], [1.15, 8], [0.9, -6]], mirage: 0.7, haze: 9000 },
      D: 520, elevDiff: 6,
      positions: [{ id: 'A', name: '射座', u: 0, v: 0, cover: 0.3, dust: 0.6, desc: '射場の射座。見通しは良い。' }],
      base: 'range',
      structures: [
        { t: 'plate', id: 'p1', du: -205, dv: -18, target: true, label: '鉄板1' },
        { t: 'plate', id: 'p2', du: -40, dv: 22, target: true, label: '鉄板2' },
        { t: 'plate', id: 'p3', du: 95, dv: -30, target: true, label: '鉄板3' },
        { t: 'plate', id: 'p4', du: 228, dv: 12, target: true, label: '鉄板4' },
        { t: 'hut2', du: 120, dv: 70, rot: 0, trp: 'TRP1' },
        { t: 'drum', du: -150, dv: -45, trp: 'TRP2' },
        { t: 'drum', du: -149, dv: -44 },
        { t: 'stake', du: 0, dv: -60, trp: 'TRP3' },
        { t: 'flag', du: -260, dv: 30 }, { t: 'flag', du: 0, dv: 40 }, { t: 'flag', du: 200, dv: -50 }
      ],
      actors: [],
      objective: { type: 'plates', text: '鉄板4枚すべてに命中させる', ids: ['p1', 'p2', 'p3', 'p4'] },
      maxShots: 15, rifles: ['r308'], rec: 'r308', noAlert: true, unlock: null
    },
    {
      id: 'm2', name: '峠の監視哨', region: 'mountain', kind: 'mission',
      place: '山岳地帯・峠道（北緯34.8°・標高2350m）',
      summary: '谷を見下ろす監視哨の歩哨2名を排除。下り撃ち。',
      brief: [
        '補給路を見張る敵の監視哨がある。歩哨2名（武装）を排除し、明朝の車列を通せるようにする。',
        '射撃位置は監視哨より100mほど高い尾根。撃ち下ろしになるので、傾斜計の角度を確認すること。DOPEカードは水平射撃の値。',
        '1人目を倒すと、もう1人はすぐに土嚢の陰へ逃げる。2発目までの時間が勝負になる。',
        '交戦規定: 武装した敵兵のみ射撃可。'
      ],
      lat: 34.8, azimuth: 40, sun: { el: 22, az: 110 },
      wx: { alt: 2350, tempC: 4, hum: 0.35, windFrom: 300, wind: 3.2, gust: 1.0, zones: [[0.8, 0], [1.3, 12], [1.0, -8]], mirage: 0.15, haze: 14000 },
      D: 640, elevDiff: -105,
      positions: [
        { id: 'A', name: '尾根の岩陰', u: 0, v: 0, cover: 0.6, dust: 0.2, desc: '岩の割れ目。隠れやすい。' },
        { id: 'B', name: '東の肩', u: -40, v: 140, cover: 0.4, dust: 0.3, desc: '少し遠いが、監視哨の側面が見える。' }
      ],
      base: 'outpost',
      structures: [
        { t: 'hut', du: 8, dv: 6, rot: 10, trp: 'TRP1' },
        { t: 'sandbags', du: -6, dv: -4, rot: 0, len: 6 },
        { t: 'sandbags', du: -2, dv: -8, rot: 70, len: 4 },
        { t: 'drum', du: 4, dv: -10, trp: 'TRP2' },
        { t: 'mast', du: 14, dv: -4, trp: 'TRP3' },
        { t: 'flag', du: 2, dv: 2 }, { t: 'rag', du: -320, dv: 20 }, { t: 'rag', du: -120, dv: -30 }
      ],
      actors: [
        { id: 's1', role: 'armed', look: 'guard2', beh: { type: 'sentry', at: [-7, 0], face: 180, binos: true } },
        { id: 's2', role: 'armed', look: 'guard3', beh: { type: 'patrol', path: [[-4, 10], [-4, -14], [6, -14]], speed: 1.1, pause: 6 } }
      ],
      objective: { type: 'eliminate', text: '武装した歩哨2名を排除', ids: ['s1', 's2'] },
      maxShots: 10, rifles: ['r308'], rec: 'r308', unlock: null
    },
    {
      id: 'm3', name: '涸れ川の車列', region: 'desert', kind: 'mission',
      place: '砂漠・涸れ川（北緯30.2°・標高450m）',
      summary: '停車中の車列。歩き回る補給担当将校を識別して排除。強い陽炎と横風。',
      brief: [
        '敵の補給車列が涸れ川で停車している。補給担当の将校を排除する。',
        '標的の特徴: 赤い頭巾（ターバン）、オリーブ色の上着、無線機を手に持つ。小銃は持っていない。トラックの間を歩き回っている。',
        '運転手は民間人（白い服・無帽）。撃てば交戦規定違反で任務失敗。',
        '気温38℃。陽炎が強い。歩いている標的には弾が届くまでの移動分のリードが必要。',
        '交戦規定: 標的の将校、および武装した敵兵のみ射撃可。'
      ],
      lat: 30.2, azimuth: 115, sun: { el: 62, az: 185 },
      wx: { alt: 450, tempC: 38, hum: 0.12, windFrom: 30, wind: 4.8, gust: 1.5, zones: [[0.85, 0], [1.2, -10], [1.0, 6]], mirage: 1.0, haze: 8000 },
      D: 820, elevDiff: 14,
      positions: [
        { id: 'A', name: '砂丘の頂', u: 0, v: 0, cover: 0.35, dust: 0.9, desc: '見通しは良いが、乾いた砂で発射時に砂ぼこりが立つ。' },
        { id: 'B', name: '岩場', u: 60, v: -150, cover: 0.65, dust: 0.3, desc: '近く、隠れやすい。車列を斜めから見る。' }
      ],
      base: 'convoy',
      structures: [
        { t: 'truck', du: -12, dv: -14, rot: 75, trp: 'TRP1' },
        { t: 'truck', du: -2, dv: 0, rot: 78 },
        { t: 'truck', du: 9, dv: 15, rot: 80 },
        { t: 'drum', du: 4, dv: -6, trp: 'TRP2' }, { t: 'drum', du: 5, dv: -5.2 },
        { t: 'rocks', du: -30, dv: 30 }, { t: 'rocks', du: 25, dv: -25 },
        { t: 'flag', du: 0, dv: 6, small: true }, { t: 'rag', du: -400, dv: -10 }, { t: 'rag', du: -200, dv: 25 }
      ],
      actors: [
        { id: 'hvt', role: 'hvt', look: { top: 0x5c6236, pants: 0x6a6450, head: 'turban', headColor: 0xa3241e, item: 'radio', beard: true }, beh: { type: 'patrol', path: [[-6, -20], [-6, 4], [4, 22], [-2, 6]], speed: 1.0, pause: 8 } },
        { id: 'g1', role: 'armed', look: 'guard', beh: { type: 'idle', at: [-18, -6], face: 270 } },
        { id: 'g2', role: 'armed', look: 'guard2', beh: { type: 'patrol', path: [[14, -10], [14, 24]], speed: 1.1, pause: 5 } },
        { id: 'c1', role: 'civ', look: 'civ', beh: { type: 'work', at: [-9, -10], face: 90 } },
        { id: 'c2', role: 'civ', look: 'civ', beh: { type: 'idle', at: [2, 5], face: 200 } },
        { id: 'c3', role: 'civ', look: 'civ2', beh: { type: 'talk', at: [10, 11], face: 300 } }
      ],
      objective: { type: 'eliminate', text: '補給担当将校（赤い頭巾・無線機）を排除', ids: ['hvt'] },
      maxShots: 8, rifles: ['r308'], rec: 'r308', unlock: 'r300'
    },
    {
      id: 'm4', name: '羊飼いの谷', region: 'mountain', kind: 'mission',
      place: '山岳地帯・谷あいの集落（北緯35.5°・標高1850m）',
      summary: '土塀越しの会合。標的は胸から上しか見えない。数分後に車で去る。',
      brief: [
        '集落の外れの家で、敵の指揮官が地元の有力者と会合している。指揮官を排除する。',
        '標的の特徴: 黒いターバン、ひげ、灰色の上着、無線機。似た格好の護衛がいる。護衛は茶色のスカーフで小銃を持っている。',
        '会合は高さ1.4mの土塀の内側。見えるのは胸から上だけ。',
        '会合は数分で終わり、指揮官はピックアップで去る。車に乗られたら任務失敗。',
        '谷の風は場所によって向きが変わる。手前と標的付近の旗の向きが違う可能性がある。',
        '交戦規定: 指揮官、および武装した敵兵のみ射撃可。白い服の老人は民間人。'
      ],
      lat: 35.5, azimuth: 300, sun: { el: 35, az: 230 },
      wx: { alt: 1850, tempC: 12, hum: 0.42, windFrom: 80, wind: 3.6, gust: 1.2, zones: [[1.0, 0], [1.25, 35], [0.8, -25]], mirage: 0.35, haze: 12000 },
      D: 975, elevDiff: -55,
      positions: [
        { id: 'A', name: '段々畑の石垣', u: 0, v: 0, cover: 0.55, dust: 0.35, desc: '石垣の陰。標準的な位置。' },
        { id: 'B', name: '南の崖', u: 80, v: -170, cover: 0.7, dust: 0.2, desc: '近いが、土塀の角度が悪く見える範囲が狭い。' },
        { id: 'C', name: '北の尾根', u: -120, v: 130, cover: 0.45, dust: 0.3, desc: '遠いが高い位置から土塀の内側がよく見える。' }
      ],
      base: 'village',
      structures: [
        { t: 'house', du: 10, dv: 4, rot: 5, trp: 'TRP1' },
        { t: 'house', du: 14, dv: -14, rot: 0 },
        { t: 'wall', du: -2, dv: 0, rot: 90, len: 18 },
        { t: 'wall', du: 4, dv: 9, rot: 0, len: 12 },
        { t: 'wall', du: 4, dv: -9, rot: 0, len: 12 },
        { t: 'pickup', du: -10, dv: 14, rot: 30, trp: 'TRP2' },
        { t: 'tank', du: 22, dv: 12, trp: 'TRP3' },
        { t: 'flag', du: 6, dv: -6 }, { t: 'rag', du: -500, dv: 10 }, { t: 'rag', du: -250, dv: -20 }
      ],
      actors: [
        { id: 'hvt', role: 'hvt', look: { top: 0x75766f, pants: 0x4a4740, head: 'turban', headColor: 0x18181a, item: 'radio', beard: true },
          beh: { type: 'meeting', at: [2, 1], face: 60, leaveAt: 200, path: [[2, 1], [2, 8], [-8, 12]], speed: 1.25, vanish: [-8, 12] } },
        { id: 'b1', role: 'armed', look: { top: 0x6f6a60, pants: 0x4a4740, head: 'turban', headColor: 0x5a3a24, item: 'rifle', beard: true }, beh: { type: 'idle', at: [3, -3], face: 250 } },
        { id: 'b2', role: 'armed', look: 'guard2', beh: { type: 'patrol', path: [[-6, 12], [-6, -12]], speed: 0.9, pause: 10 } },
        { id: 'el', role: 'civ', look: 'elder', beh: { type: 'talk', at: [4, 2.5], face: 240 } }
      ],
      objective: { type: 'eliminate', text: '指揮官（黒いターバン・無線機）を排除', ids: ['hvt'] },
      maxShots: 8, rifles: ['r308', 'r300'], rec: 'r300', unlock: null
    },
    {
      id: 'm5', name: '稜線の中継所', region: 'mountain', kind: 'mission',
      place: '高山・稜線（北緯36.2°・標高3150m）',
      summary: '氷点下・高地の撃ち上げ。通信兵2名を排除。空気が薄く弾がよく伸びる。',
      brief: [
        '稜線上の無線中継所が敵の通信の要になっている。通信兵2名を排除する。',
        '通信兵の特徴: ヘッドセット（頭に黒い帽子に見える）、無線機を持つ。武装した警備兵が1名巡回している。',
        '標高3150m・気温−9℃。密度高度が高く、空気が薄い。気温が低いので初速も下がる。DOPEカードの列を必ず確認すること。',
        '撃ち上げ（約+7°）。風は稜線で強まる。',
        '交戦規定: 敵の通信兵、および武装した敵兵のみ射撃可。'
      ],
      lat: 36.2, azimuth: 20, sun: { el: 30, az: 140 },
      wx: { alt: 3150, tempC: -9, hum: 0.3, windFrom: 270, wind: 5.2, gust: 1.8, zones: [[0.7, 0], [1.0, 10], [1.45, -5]], mirage: 0.05, haze: 22000 },
      D: 1140, elevDiff: 140,
      positions: [
        { id: 'A', name: '雪渓の縁', u: 0, v: 0, cover: 0.45, dust: 0.05, desc: '雪の上。発射時の砂ぼこりはほぼない。' },
        { id: 'B', name: '岩塔の下', u: 90, v: 120, cover: 0.7, dust: 0.15, desc: '少し近い。岩に隠れやすい。' }
      ],
      base: 'relay',
      structures: [
        { t: 'mast', du: 6, dv: 2, trp: 'TRP1' },
        { t: 'tent', du: -4, dv: -10, rot: 20, trp: 'TRP2' },
        { t: 'generator', du: 2, dv: 8, rot: 0, id: 'gen' },
        { t: 'sandbags', du: -8, dv: 4, rot: 90, len: 6 },
        { t: 'drum', du: 4, dv: 11 },
        { t: 'flag', du: 8, dv: -2 }, { t: 'rag', du: -600, dv: 0 }, { t: 'rag', du: -300, dv: 30 }
      ],
      actors: [
        { id: 'r1', role: 'hvt', look: { top: 0x4e5446, pants: 0x3c3f34, head: 'cap', headColor: 0x111111, item: 'radio' }, beh: { type: 'work', at: [0, 6], face: 0 } },
        { id: 'r2', role: 'hvt', look: { top: 0x4e5446, pants: 0x3c3f34, head: 'cap', headColor: 0x111111, item: 'radio', beard: true }, beh: { type: 'patrol', path: [[-2, -6], [1, 5], [6, 4]], speed: 0.8, pause: 14 } },
        { id: 'g1', role: 'armed', look: 'guard', beh: { type: 'patrol', path: [[-10, -14], [-10, 12], [10, 14], [10, -12]], speed: 1.0, pause: 4 } }
      ],
      objective: { type: 'eliminate', text: '通信兵2名を排除', ids: ['r1', 'r2'] },
      maxShots: 10, rifles: ['r308', 'r300'], rec: 'r300', unlock: 'r338'
    },
    {
      id: 'm6', name: '砂丘の向こう', region: 'desert', kind: 'mission',
      place: '砂漠・宿営地（北緯28.4°・標高300m）',
      summary: '1350m・強い横風と突風。宿営地を歩く指揮官を排除。',
      brief: [
        '砂丘の向こうの宿営地に、作戦指揮官が滞在している。排除する。',
        '標的の特徴: 白いターバン、黒いベスト、無線機。護衛は迷彩服にヘルメット。',
        '南からの強い横風（7m/s前後）。突風で風速が大きく変わる。旗と陽炎を見て、風が落ち着いた瞬間を待つこと。',
        '炊事係の民間人が2名いる。',
        '交戦規定: 指揮官、および武装した敵兵のみ射撃可。'
      ],
      lat: 28.4, azimuth: 80, sun: { el: 55, az: 200 },
      wx: { alt: 300, tempC: 41, hum: 0.1, windFrom: 175, wind: 7.2, gust: 2.4, zones: [[1.1, 0], [0.85, 12], [1.2, -8]], mirage: 1.1, haze: 9500 },
      D: 1350, elevDiff: 12,
      positions: [
        { id: 'A', name: '砂丘の背', u: 0, v: 0, cover: 0.4, dust: 0.95, desc: '砂ぼこりが立ちやすい。' },
        { id: 'B', name: '枯れ木の根元', u: 150, v: 160, cover: 0.6, dust: 0.6, desc: '200mほど近い。' }
      ],
      base: 'camp',
      structures: [
        { t: 'tent', du: 0, dv: -12, rot: 0, trp: 'TRP1' },
        { t: 'tent', du: 12, dv: 6, rot: 90 },
        { t: 'tent', du: -8, dv: 14, rot: 10 },
        { t: 'net', du: 20, dv: -20, rot: 0, trp: 'TRP2' },
        { t: 'truck', du: 24, dv: -22, rot: 10 },
        { t: 'sandbags', du: -14, dv: 0, rot: 90, len: 8 },
        { t: 'drum', du: -6, dv: 2, trp: 'TRP3' },
        { t: 'flag', du: 4, dv: 0 }, { t: 'rag', du: -700, dv: 0 }, { t: 'rag', du: -350, dv: -20 }
      ],
      actors: [
        { id: 'hvt', role: 'hvt', look: { top: 0xc9bfa6, pants: 0x8e826a, head: 'turban', headColor: 0xf3f0e8, vest: 0x1e1e1e, item: 'radio', beard: true }, beh: { type: 'patrol', path: [[-4, -4], [6, -2], [6, 8], [-4, 6]], speed: 0.9, pause: 12 } },
        { id: 'g1', role: 'armed', look: 'guard', beh: { type: 'idle', at: [-12, -4], face: 270 } },
        { id: 'g2', role: 'armed', look: 'guard', beh: { type: 'patrol', path: [[-16, -18], [-16, 18]], speed: 1.1, pause: 6 } },
        { id: 'g3', role: 'armed', look: 'guard2', beh: { type: 'idle', at: [10, -14], face: 180 } },
        { id: 'c1', role: 'civ', look: 'civ', beh: { type: 'work', at: [-2, 12], face: 90 } },
        { id: 'c2', role: 'civ', look: 'civ2', beh: { type: 'idle', at: [0, 14], face: 300 } }
      ],
      objective: { type: 'eliminate', text: '作戦指揮官（白いターバン・黒いベスト）を排除', ids: ['hvt'] },
      maxShots: 8, rifles: ['r308', 'r300', 'r338'], rec: 'r338', unlock: 'r50'
    },
    {
      id: 'm7', name: '格納庫の発電機', region: 'desert', kind: 'mission',
      place: '岩石砂漠・無人機の前進基地（北緯32.0°・標高1200m）',
      summary: '1600m先の発電機のエンジン部を破壊。対物射撃。',
      brief: [
        '敵の無人機が使う前進基地の発電機を止める。エンジン部（0.6m角）に12.7mm弾を命中させれば破壊できる。小口径の弾では止まらない。',
        '発電機が止まると整備兵が様子を見に来る。武装した警備兵2名。',
        '距離およそ1600m。12.7mm弾でも飛行時間は2秒を超える。スピンドリフト（弾の回転による右へのずれ）が無視できない距離。',
        '交戦規定: 発電機、および武装した敵兵のみ射撃可。'
      ],
      lat: 32.0, azimuth: 160, sun: { el: 40, az: 120 },
      wx: { alt: 1200, tempC: 24, hum: 0.2, windFrom: 250, wind: 4.0, gust: 1.3, zones: [[0.9, 0], [1.15, -12], [1.0, 10]], mirage: 0.6, haze: 15000 },
      D: 1600, elevDiff: -40,
      positions: [
        { id: 'A', name: '台地の縁', u: 0, v: 0, cover: 0.5, dust: 0.7, desc: '台地の縁。基地全体が見える。' },
        { id: 'B', name: '涸れ谷の出口', u: 260, v: -180, cover: 0.65, dust: 0.5, desc: '約250m近いが、見える角度が浅い。' }
      ],
      base: 'hangar',
      structures: [
        { t: 'net', du: 6, dv: 0, rot: 0, big: true, trp: 'TRP1' },
        { t: 'generator', du: -6, dv: -6, rot: 90, id: 'gen', target: true, label: '発電機' },
        { t: 'tank', du: 12, dv: -16, trp: 'TRP2' },
        { t: 'pickup', du: -14, dv: 10, rot: 60 },
        { t: 'sandbags', du: -12, dv: -2, rot: 90, len: 10 },
        { t: 'drum', du: -4, dv: -10 }, { t: 'drum', du: -4.6, dv: -9.4 },
        { t: 'flag', du: 0, dv: 10 }, { t: 'rag', du: -800, dv: 10 }, { t: 'rag', du: -400, dv: -20 }
      ],
      actors: [
        { id: 'g1', role: 'armed', look: 'guard', beh: { type: 'patrol', path: [[-16, -16], [-16, 16]], speed: 1.0, pause: 8 } },
        { id: 'g2', role: 'armed', look: 'guard3', beh: { type: 'idle', at: [8, 6], face: 180 } },
        { id: 'w1', role: 'armed', look: { top: 0x3d3f45, pants: 0x3d3f45, head: 'cap', headColor: 0x2a2a2a, item: 'rifle' }, beh: { type: 'work', at: [10, 2], face: 0, responder: true } }
      ],
      objective: { type: 'materiel', text: '発電機のエンジン部を破壊', ids: ['gen'] },
      maxShots: 8, rifles: ['r338', 'r50'], rec: 'r50', unlock: null
    },
    {
      id: 'm8', name: '鷹の巣', region: 'mountain', kind: 'mission',
      place: '高山・断崖の拠点（北緯34.0°・標高2700m）',
      summary: '2050m。洞窟から出てくる最高指揮官を、車に乗る前に排除。最終任務。',
      brief: [
        '断崖の中腹にある拠点に最高指揮官がいる。情報では、もうすぐ洞窟の入口から出て、下の車まで歩く。車に乗られたら追えない。',
        '標的の特徴: 黒いターバン、白い上着、黒いベスト、無線機。護衛が2名つく。',
        '距離約2050m・撃ち下ろし約−9°。飛行時間は3秒を超える。歩いている間に撃っても、弾が届く前に数m動いてしまう。立ち止まる瞬間を狙うこと。',
        '東向きの射撃。この距離ではコリオリ効果（地球の自転による弾道のずれ）も効いてくる。',
        '交戦規定: 最高指揮官、および武装した敵兵のみ射撃可。'
      ],
      lat: 34.0, azimuth: 95, sun: { el: 18, az: 250 },
      wx: { alt: 2700, tempC: -3, hum: 0.25, windFrom: 350, wind: 4.4, gust: 1.6, zones: [[0.7, 0], [1.3, 25], [1.0, -15]], mirage: 0.1, haze: 26000 },
      D: 2050, elevDiff: -320,
      positions: [
        { id: 'A', name: '鷹の岩', u: 0, v: 0, cover: 0.6, dust: 0.2, desc: '高い岩棚。拠点の全体が見える。' },
        { id: 'B', name: '低い尾根', u: 300, v: 120, cover: 0.55, dust: 0.3, desc: '約300m近いが、洞窟の入口は見えにくい。' }
      ],
      base: 'cliff',
      structures: [
        { t: 'cave', du: 18, dv: -6, rot: 0, trp: 'TRP1' },
        { t: 'pickup', du: -6, dv: 14, rot: 90, trp: 'TRP2' },
        { t: 'hut', du: 10, dv: 16, rot: 0, trp: 'TRP3' },
        { t: 'sandbags', du: -10, dv: -2, rot: 90, len: 8 },
        { t: 'drum', du: 2, dv: 18 },
        { t: 'flag', du: 4, dv: 2 }, { t: 'rag', du: -900, dv: 0 }, { t: 'rag', du: -450, dv: 25 }
      ],
      actors: [
        { id: 'hvt', role: 'hvt', look: { top: 0xe9e6de, pants: 0x55524a, head: 'turban', headColor: 0x141414, vest: 0x1d1d1d, item: 'radio', beard: true },
          beh: { type: 'emerge', startAt: 70, path: [[16, -6], [8, -2], [2, 4], [-4, 10], [-6, 12]], speed: 1.1, stops: { 2: 9, 3: 6 }, vanish: [-6, 13] } },
        { id: 'g1', role: 'armed', look: 'guard2', beh: { type: 'idle', at: [-2, 8], face: 250 } },
        { id: 'g2', role: 'armed', look: 'guard', beh: { type: 'patrol', path: [[-12, -10], [-12, 10]], speed: 1.0, pause: 8 } },
        { id: 'g3', role: 'armed', look: 'guard3', beh: { type: 'emerge', startAt: 66, path: [[16, -6], [10, -4], [4, 2], [-2, 8]], speed: 1.1, stops: {}, vanish: null } }
      ],
      objective: { type: 'eliminate', text: '最高指揮官（黒いターバン・白い上着）を排除', ids: ['hvt'] },
      maxShots: 6, rifles: ['r338', 'r50'], rec: 'r50', unlock: null
    }
  ];
  SN.missionById = (id) => SN.MISSIONS.find(m => m.id === id);
})(typeof window !== 'undefined' ? window : globalThis);
