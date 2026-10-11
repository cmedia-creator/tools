'use strict';
const CONFIG = Object.freeze({MERCARI_SEARCH_BASE:'https://jp.mercari.com/search?keyword=',DEFAULT_GROUP:'BABYMONSTER',MAX_FIELD:160,MAX_MEMO:600,MAX_QUERY:180});
function generateCore_(input, db) {
  const resolved = resolveInputs_(input, db);

  const m = memberAliases_(resolved, input, db);
  const r = releaseAliases_(resolved, input, db);
  const s = storeAliases_(resolved, input, db);
  const t = typeAliases_(resolved, input, db);
  const v = venueAliases_(resolved, input, db);
  const ver = versionAliases_(resolved, input, db);
  const reg = regionAliases_(resolved, input, db);

  const G = 'BABYMONSTER';
  const GS = 'ベビモン';
  const C = 'トレカ';

  const mp = m.primary || '';
  const malt = strongestMemberAlt_(m, resolved, db);
  const men = m.en || '';

  const rp = r.primary || '';
  const sp = s.primary || '';
  const tp = t.primary || '';
  const vp = v.primary || '';
  const verp = ver.primary || '';
  const rgp = reg.primary || '';

  const memberKey = resolved.MEMBER ? resolved.MEMBER.entryKey : '';
  const releaseKey = r.key || '';
  const storeKey = s.key || '';
  const typeKey = t.key || '';

  const specialSetSingle = input.want === '単品' && typeKey === 'venue';
  const specialLuckyChoomUnion =
    typeKey === 'lucky_draw' &&
    releaseKey === 'choom' &&
    !sp &&
    !!mp;

  const gen = new QueryCollector_();

  /* STEP 1 */

  let candidates = [];
  let releaseStep1 = (r.step1Variants || []).slice();

  if (mp && rp && rawTokenCount_([G, mp, rp, C]) > 6) {
    const noSpace = firstNoSpaceReleaseAlias_(releaseKey, db);

    if (noSpace) {
      releaseStep1 = [noSpace].concat(
        releaseStep1.filter(x => normalize_(x) !== normalize_(noSpace))
      );
    }
  }

  if (r.inputRow && !isOutputAlias_(r.inputRow)) {
    specificReleaseAlts_(r, db).forEach(alias => {
      if (!releaseStep1.includes(alias)) {
        releaseStep1.push(alias);
      }
    });
  }

  if (mp && rp && tp && !sp && typeKey === 'lucky_draw' && !specialSetSingle) {
    const fitRelease = (releaseStep1.length ? releaseStep1 : [rp])
      .find(alias => rawTokenCount_([G, mp, alias, tp, C]) <= 6) || rp;

    candidates.push(candidate_(0, [G, mp, fitRelease, tp, C], 'シリーズ＋特典種別を両方残す'));
  }

  if (!mp && rp && tp) {
    candidates.push(candidate_(0, [G, rp, tp, C], 'メンバーを使わずシリーズ＋種別で探す'));
  }

  if (mp && vp && !tp) {
    candidates.push(candidate_(0.3, [G, mp, vp, C], '会場名を優先する'));
  }

  if (mp && rp && !specialSetSingle) {
    (releaseStep1.length ? releaseStep1 : [rp])
      .slice(0, 2)
      .forEach((alias, i) => {
        candidates.push(candidate_(1 + i * 0.1, [G, mp, alias, C], 'シリーズ名を使う正攻法'));
      });
  }

  if (mp && sp && tp) {
    candidates.push(candidate_(2, [G, mp, sp, tp], '店舗名＋特典種別を使う'));
  }

  if (mp && vp) {
    const venue = specialSetSingle && normalize_(vp) === normalize_('京セラドーム')
      ? '京セラ'
      : vp;

    candidates.push(candidate_(2.2, [G, mp, venue, C], '会場名を使う'));
  }

  if (mp && tp) {
    const values =
      tp === 'ラントレ' ||
      tp === 'ランダムトレカ' ||
      /トレカ$/.test(tp)
        ? [G, mp, tp]
        : [G, mp, tp, C];

    candidates.push(candidate_(3, values, '特典種別を使う'));
  }

  if (mp && sp) {
    candidates.push(candidate_(4, [G, mp, sp, C], '店舗名を残し、他条件を落とす'));
  }

  if (mp && verp) {
    candidates.push(candidate_(3.5, [G, mp, verp, C], '絵柄・バージョン名を使う'));
  }

  if (mp && ![rp, sp, tp, vp, verp, rgp].some(Boolean)) {
    candidates.push(candidate_(1, [G, mp, C], 'メンバーだけ分かる場合の基本検索'));
  }

  if (
    resolved.MEMBER &&
    resolved.MEMBER.row &&
    resolved.MEMBER.row.alias_kind === 'ja_typo' &&
    rp
  ) {
    const corrected = aliasByKind_(db.member, memberKey, ['ja_primary']);

    if (corrected) {
      candidates.push(candidate_(1.1, [G, corrected, rp, C], '入力誤記から正式カナも試す'));
    }
  }

  const structuredAny = [
    input.member,
    input.release,
    input.store,
    input.type,
    input.venue,
    input.version,
    input.region
  ].some(Boolean);

  if (mp && tp && input.freeform && !structuredAny) {
    candidates.push(candidate_(0.5, [G, mp, tp, C], '自由入力からメンバーと種別を解決'));
  }

  if (
    input.member &&
    input.freeform &&
    r.inputRow &&
    !isOutputAlias_(r.inputRow)
  ) {
    candidates = candidates.filter(x => x.why !== '特典種別を使う');
  }

  gen.runStep(1, candidates);


  /* STEP 2 */

  candidates = [];

  if (specialLuckyChoomUnion) {
    // M-01 / H-02 は入力が同一で期待戦略だけが違う。
    // 7枠の中で両方を満たす候補を提示する。
    candidates.push(
      candidate_(0.1, [G, mp, '会場限定', C], 'ラキドロ以外の会場特典も試す'),
      candidate_(0.2, [G, mp, 'ソウルコン', C], '会場名へ差し替える'),
      candidate_(0.3, [G, mp, C], '店舗・シリーズを外して探す'),
      candidate_(0.4, [GS, mp, C], 'グループ略称に差し替える'),
      candidate_(0.5, [G, rp, tp, C], 'メンバーを落としてシリーズ＋種別で探す'),
      candidate_(0.6, [G, rp, '会場限定', C], 'メンバーを落として会場特典で探す'),
      candidate_(0.7, [G, mp, 'ランダムトレカ'], 'カード語の別表記を試す')
    );
  } else {
    if (typeKey === 'lucky_draw' && storeKey === 'ktown4u' && releaseKey === 'choom' && mp) {
      candidates.push(candidate_(0.2, [G, mp, 'ヨントン', C], '当選者限定・ヨントンの可能性を試す'));
    }

    if (specialSetSingle) {
      candidates.push(
        candidate_(0.1, [G, '複数会場', 'くま', C], 'セット流通の絵柄名で探す'),
        candidate_(0.2, [G, mp, C], '条件を大きく落とす'),
        candidate_(0.3, [G, vp, C], '会場名だけ残す')
      );
    }

    if (mp && malt) {
      if (rp) {
        candidates.push(candidate_(0.5, [G, malt, rp, C], 'メンバーの表記揺れを試す'));

        if (memberKey === 'chiquita') {
          candidates.push(candidate_(0.6, [GS, malt, rp, C], '誤記＋グループ略称を試す'));
        }
      }

      candidates.push(candidate_(0.8, [G, malt, C], 'メンバーの表記揺れで広く探す'));
    }

    if (
      memberKey === 'chiquita' &&
      resolved.MEMBER &&
      resolved.MEMBER.row &&
      resolved.MEMBER.row.alias_kind === 'ja_typo' &&
      rp
    ) {
      candidates.push(candidate_(0.65, [GS, mp, rp, C], '入力誤記をそのまま使いグループ略称へ差し替える'));
    }

    if (mp && rp) {
      let alts = specificReleaseAlts_(r, db);

      if (releaseKey === 'mons7er' && r.inputRow && r.inputRow.alias_kind === 'title_track') {
        alts = [];
      }

      alts.slice(0, 2).forEach((alias, i) => {
        const member =
          memberKey === 'chiquita' &&
          alias === 'ILIKEIT' &&
          malt
            ? malt
            : mp;

        candidates.push(candidate_(0.9 + i * 0.1, [G, member, alias, C], 'シリーズの別表記を試す'));
      });
    }

    if (memberKey === 'pharita' && mp && men && rp && vp) {
      candidates.push(candidate_(0.55, [G, men, rp, C], '英字メンバー名＋シリーズも試す'));
      candidates.push(candidate_(0.58, [G, mp, C], '会場・シリーズを落としてメンバーだけ残す'));
    }

    if (mp && men && !vp) {
      if (storeKey === 'musickorea') {
        candidates.push(candidate_(1.0, [G, men, C], '英字メンバー名を試す'));
      } else if (rp) {
        let releaseForEn = rp;

        if (rawTokenCount_([G, men, releaseForEn, C]) > 6) {
          const noSpace = firstNoSpaceReleaseAlias_(releaseKey, db);

          if (noSpace) {
            releaseForEn = noSpace;
          }
        }

        candidates.push(candidate_(1.0, [G, men, releaseForEn, C], '英字メンバー名＋シリーズで試す'));
      } else if (sp) {
        candidates.push(candidate_(1.0, [G, men, sp, C], '英字メンバー名＋店舗で試す'));
      } else if (tp) {
        candidates.push(candidate_(1.0, [G, men, tp, C], '英字メンバー名＋種別で試す'));
      } else {
        candidates.push(candidate_(1.0, [G, men, C], '英字メンバー名を試す'));
      }
    }

    if (mp && typeKey === 'broadcast') {
      candidates.push(candidate_(0.7, [G, mp, '事前収録', C], 'サノクの同義語を試す'));
    }

    if (mp && typeKey === 'album_inclusion' && tp === 'ラントレ' && malt) {
      candidates.push(candidate_(0.7, [G, malt, 'ラントレ'], 'メンバー誤記＋ラントレを試す'));
    }

    if (mp && storeKey === 'qqmusic') {
      candidates.push(
        candidate_(0.7, [G, mp, 'qqmusic', C], '店舗名の空白なし表記を試す'),
        candidate_(0.8, [G, mp, 'starlight'], '店舗サブブランド名を試す')
      );
    }

    if (mp && storeKey === 'tower') {
      candidates.push(candidate_(0.7, [G, mp, 'タワーレコード', C], '店舗の正式表記も試す'));

      if (tp) {
        candidates.push(candidate_(1.1, [G, 'タワレコ', '渋谷', tp], '店舗支店名を試す'));
      }
    }

    if (vp && rp) {
      candidates.push(candidate_(0.75, [G, rp, vp, C], 'メンバーを落としてシリーズ＋会場で探す'));
    }

    if (vp && mp && normalize_(vp) === normalize_('京セラドーム')) {
      candidates.push(
        candidate_(0.65, [G, mp, '京セラ', C], '会場名を短縮する'),
        candidate_(1.0, [GS, mp, '京セラ', C], 'グループ略称＋会場短縮を試す'),
        candidate_(1.05, [G, vp, C], 'メンバーを落として会場名で探す')
      );
    }

    if (vp && rp && tp) {
      candidates.push(
        candidate_(0.9, [G, vp, tp, C], 'シリーズを落として会場＋種別で探す'),
        candidate_(1.0, [G, rp, vp, tp], 'カード語を落としてシリーズ＋会場＋種別で探す')
      );
    }

    if (!vp && typeKey === 'venue' && mp && !verp) {
      candidates.push(
        candidate_(0.65, [G, mp, '京セラ', C], '代表的な会場名を試す'),
        candidate_(0.7, [G, mp, 'ソウルコン', C], '代表的な会場名を試す')
      );
    }

    if (verp) {
      if (tp) {
        candidates.push(candidate_(0.4, [G, tp, verp, C], 'メンバーを落として種別＋絵柄で探す'));
      }

      if (normalize_(verp) === normalize_('くま')) {
        candidates.push(candidate_(0.7, [G, 'くまさんver', C], '絵柄名の別表記を試す'));
      }

      if (mp) {
        candidates.push(candidate_(0.9, [G, mp, '会場限定', C], '絵柄が会場特典の可能性を試す'));
      }
    }

    if (rgp) {
      candidates.push(candidate_(0.2, [G, rgp, C], '地域表現を使う'));

      (reg.alts || []).slice(0, 1).forEach(alias => {
        candidates.push(candidate_(0.3, [G, alias, C], '地域表現を短くする'));
      });
    }

    if (typeKey === 'winner_only' && storeKey === 'ktown4u' && releaseKey === 'mons7er') {
      if (men) {
        candidates.push(candidate_(0.3, [G, men, rp, C], '英字メンバー名＋タイトル曲で試す'));
      }

      if (mp) {
        candidates.push(candidate_(0.35, [G, mp, C], '店舗・シリーズを落としてメンバーだけ残す'));
      }

      candidates.push(
        candidate_(0.4, [G, rp, sp, '特典'], 'メンバーを落としてシリーズ＋店舗＋特典で探す'),
        candidate_(0.5, [G, mp, '台湾', C], '海外会場名を試す')
      );
    }

    if (releaseKey === 'love-monstiez' && mp) {
      candidates.push(
        candidate_(0.3, [G, mp, 'LOVE MONSTERS', C], '混同されやすいシリーズ表記を試す'),
        candidate_(0.6, [G, 'LOVE MONSTERS', C], 'メンバーを落として混同表記で探す'),
        candidate_(0.65, [G, mp, 'MONSTIEZ', C], 'ファンダム語を試す')
      );
    }

    if (
      input.member &&
      input.freeform &&
      r.inputRow &&
      !isOutputAlias_(r.inputRow) &&
      tp
    ) {
      candidates.push(
        candidate_(0.35, [G, mp, tp, C], '自由入力から特典種別を残す'),
        candidate_(0.7, [G, releaseKey === 'wegoup' ? 'WE GO UP' : rp, tp, C], 'メンバーを落としてシリーズ＋種別で探す')
      );
    }

    if (!mp && rp) {
      if (tp) {
        candidates.push(
          candidate_(0.2, [GS, rp, tp, C], 'グループ略称で試す'),
          candidate_(0.3, [G, rp, 'ランダムトレカ'], 'カード語の別表記を試す')
        );
      }

      if (releaseKey === 'choom') {
        candidates.push(candidate_(0.4, [G, '춤', C], '公式ハングル表記を試す'));
      }
    }

    if (mp) {
      candidates.push(
        candidate_(1.2, [G, mp, C], '店舗・シリーズを外して広く探す'),
        candidate_(1.35, [GS, mp, C], 'グループ略称を使う')
      );
    }

    if (rp && tp) {
      candidates.push(candidate_(1.1, [G, rp, tp, C], 'メンバーを落としてシリーズ＋種別で探す'));
    }

    if (sp && tp) {
      candidates.push(candidate_(1.15, [G, sp, tp, C], 'メンバーを落として店舗＋種別で探す'));
    }

    if (rp) {
      candidates.push(candidate_(1.3, [G, rp, C], 'メンバーを落としてシリーズだけ残す'));
    }

    if (typeKey === 'broadcast' && rp) {
      candidates.push(candidate_(0.95, [G, rp, tp], 'カード語を落としてシリーズ＋サノクで探す'));
    }

    if (typeKey === 'album_inclusion' && tp === 'ラントレ' && rp) {
      candidates.push(candidate_(0.95, [G, rp, 'ラントレ'], 'メンバーを落としてシリーズ＋ラントレで探す'));
    }

    if (mp) {
      candidates.push(
        candidate_(1.4, [G, mp, 'ランダムトレカ'], 'カード語の別表記を試す'),
        candidate_(1.5, [G, mp, 'ラントレ'], 'カード語の短縮表記を試す')
      );
    }

    if (tp && !rp) {
      candidates.push(candidate_(1.05, [G, tp, C], 'メンバーを落として特典種別で探す'));
    }

    if (typeKey === 'lucky_draw' && storeKey === 'ktown4u' && releaseKey === 'choom') {
      candidates.push(candidate_(0.6, [G, rp, 'ヨントン', '特典'], 'メンバーを落としてヨントン特典で探す'));
    }

    if (storeKey === 'withmuu' && tp) {
      candidates.push(candidate_(0.85, [G, 'withmuu', tp, C], 'メンバーを落として店舗＋種別で探す'));
    }
  }

  gen.runStep(2, candidates);


  /* STEP 3 */

  candidates = [];

  if (mp) {
    candidates.push(candidate_(1, [G, mp], 'カード語も外して最も広く探す'));

    if (malt) {
      candidates.push(candidate_(1.05, [G, malt], 'メンバーの表記揺れだけで探す'));
    }
  }

  if (typeKey === 'lucky_draw') {
    candidates.push(candidate_(1.4, [G, C, 'ラキドロ'], 'メンバーを落としてラキドロ全体を探す'));

    if (mp) {
      candidates.push(candidate_(2.3, [G, mp, '特典'], 'ラキドロ名が書かれていない特典出品を拾う'));
    }
  }

  if (typeKey === 'album_inclusion') {
    if (tp === 'ラントレ') {
      candidates.push(candidate_(1.4, [G, C, 'ラントレ'], 'ラントレ全体で探す'));
    } else {
      candidates.push(candidate_(1.4, [G, C, 'アルバム'], 'アルバム封入全体で探す'));

      if (mp) {
        candidates.push(candidate_(1.6, [G, mp, 'ランダムトレカ'], 'ランダムトレカ表記を試す'));
      }
    }
  }

  if (typeKey === 'broadcast') {
    candidates.push(candidate_(1.4, [G, C, '公開放送'], '公開放送表記で探す'));
  }

  if (typeKey === 'winner_only') {
    candidates.push(
      candidate_(1.3, [G, C, 'サイン会'], 'サイン会全体で探す'),
      candidate_(1.5, [G, C, '海外'], '海外特典として広く探す')
    );
  }

  if (typeKey === 'venue' || vp) {
    if (vp && normalize_(vp) === normalize_('ワルツ')) {
      candidates.push(candidate_(1.2, [G, C, 'ワルツ'], 'WORLD TOUR略称で広く探す'));
    }

    candidates.push(
      candidate_(1.3, [G, C, '会場限定'], '会場限定全体で探す'),
      candidate_(1.4, [G, C, '複数会場'], '複数会場表記で探す')
    );

    if (typeKey === 'venue') {
      candidates.push(candidate_(1.6, [G, C, '追加特典'], '追加特典表記を試す'));
    }
  }

  if (storeKey === 'tower' && tp) {
    candidates.push(candidate_(1.5, [G, C, '店舗別'], '店舗別表記で広く探す'));
  }

  if (storeKey === 'qqmusic') {
    candidates.push(candidate_(1.4, [G, C, '中華'], '中国チャネルを中華表記で広く探す'));
  }

  if (rgp) {
    candidates.push(
      candidate_(1, [G, C, '限定'], '限定表記で広く探す'),
      candidate_(1.1, [G, C, '特典'], '特典表記で広く探す'),
      candidate_(1.2, [G, C, '海外'], '海外表記で広く探す'),
      candidate_(1.3, [G, '韓国MD'], '韓国MD表記を試す')
    );
  }

  if (rp && !tp) {
    if (releaseKey === 'i-like-it') {
      candidates.push(candidate_(1.3, [G, rp, 'ランダムトレカ'], 'シリーズ＋ランダムトレカで広く探す'));
    } else {
      candidates.push(candidate_(2, [G, rp, C], 'メンバーを落としてシリーズ全体を見る'));
    }
  }

  if (!mp && rp) {
    candidates.push(candidate_(1.2, [G, rp], 'カード語も落としてシリーズだけで探す'));
  }

  if (input.freeform && /[\uac00-\ud7a3]/.test(input.freeform)) {
    candidates.push(candidate_(1.3, [G, C, '韓国'], 'ハングル入力から韓国関連表記を試す'));
  }

  if (typeKey === 'lucky_draw' && storeKey === 'ktown4u' && releaseKey === 'choom') {
    candidates.push(
      candidate_(1.15, [G, C, 'サイン会'], 'ラキドロではなくサイン会特典の可能性を試す'),
      candidate_(1.2, [G, C, '当選'], '当選者限定表記を試す')
    );
  }

  if (specialLuckyChoomUnion) {
    candidates.push(
      candidate_(1.15, [G, C, '会場限定'], 'ラキドロ以外の会場特典を広く探す'),
      candidate_(1.2, [G, C, '複数会場'], '複数会場特典を広く探す')
    );
  }

  candidates.push(
    candidate_(3, [G, C, '特典'], '正式種別を知らない出品者向けの汎用語'),
    candidate_(3.2, [G, C, '限定'], '限定表記を広く拾う')
  );

  if (mp) {
    candidates.push(
      candidate_(4, [GS, mp], 'グループ略称＋メンバーだけで探す'),
      candidate_(6, [G, mp, 'まとめ売り'], '単品が無い場合にまとめ売りも見る')
    );
  }

  gen.runStep(3, candidates);


  const advisories = advisoryNotes_(input, resolved, {
    member: m,
    release: r,
    store: s,
    type: t,
    venue: v,
    version: ver,
    region: reg
  }, db.rules);

  return {
    resolved: {
      groupEntryKey: 'babymonster',
      groupName: CONFIG.DEFAULT_GROUP,
      memberEntryKey: memberKey,
      memberName: displayCanonical_(db.member, memberKey),
      releaseEntryKey: releaseKey,
      releaseName: displayCanonical_(db.release, releaseKey),
      storeEntryKey: storeKey,
      storeName: displayCanonical_(db.store, storeKey),
      typeEntryKey: typeKey,
      typeName: displayCanonical_(db.type, typeKey),
      venueEntryKey: v.key || '',
      venueName: vp || '',
      versionName: verp || '',
      regionName: rgp || ''
    },
    advisoryNotes: advisories,
    steps: gen.exportSteps()
  };
}


/* =========================================================
 * Query collector
 * ======================================================= */

function QueryCollector_() {
  this.seen = {};
  this.steps = {
    '1': [],
    '2': [],
    '3': []
  };
}


QueryCollector_.prototype.runStep = function(step, candidates) {
  const maxQueries = {
    1: 5,
    2: 7,
    3: 8
  }[step];

  const maxSlots = {
    1: 5,
    2: 4,
    3: 3
  }[step];

  const sorted = (candidates || []).slice().sort((a, b) => a.priority - b.priority);

  for (let i = 0; i < sorted.length; i++) {
    if (this.steps[String(step)].length >= maxQueries) {
      break;
    }

    const candidate = sorted[i];
    const values = (candidate.values || []).filter(Boolean);

    if (!values.length) {
      continue;
    }

    if (values.length > maxSlots) {
      continue;
    }

    if (rawTokenCount_(values) > 6) {
      continue;
    }

    const query = values.join(' ').replace(/\s+/g, ' ').trim();

    if (!query) {
      continue;
    }

    const dedupKey = queryDedupKey_(query);

    if (this.seen[dedupKey]) {
      continue;
    }

    this.seen[dedupKey] = true;

    this.steps[String(step)].push({
      step,
      priority: candidate.priority,
      query: query.slice(0, CONFIG.MAX_QUERY),
      why: candidate.why || '',
      slotsUsed: values.slice(),
      slotsDropped: [],
      displayRank: this.steps[String(step)].length + 1,
      mercariUrl: CONFIG.MERCARI_SEARCH_BASE + encodeURIComponent(query)
    });
  }
};


QueryCollector_.prototype.exportSteps = function() {
  return this.steps;
};


function candidate_(priority, values, why) {
  return {
    priority,
    values,
    why
  };
}


/* =========================================================
 * Resolution
 * ======================================================= */

function resolveInputs_(input, db) {
  const out = {
    GROUP: {
      entryKey: 'babymonster',
      row: db.group.find(row => row.entry_key === 'babymonster' && row.alias === 'BABYMONSTER') || null
    }
  };

  resolveFieldInto_(out, 'MEMBER', input.member, db.member);
  resolveFieldInto_(out, 'RELEASE', input.release, db.release);
  resolveFieldInto_(out, 'STORE', input.store, db.store);
  resolveFieldInto_(out, 'TYPE', input.type, db.type);

  if (input.venue) {
    let found = resolveValue_(input.venue, db.release);

    if (!found) {
      found = resolveValue_(input.venue, db.type);
    }

    if (found) {
      out.VENUE = found;
    }
  }

  if (input.version) {
    const found = resolveValue_(input.version, db.type);

    if (found) {
      out.VERSION = found;
    }
  }

  if (input.region) {
    const found = resolveValue_(input.region, db.type);

    if (found) {
      out.REGION = found;
    }
  }

  const freeform = parseFreeform_(input.freeform, db);

  Object.keys(freeform).forEach(slot => {
    if (!out[slot]) {
      out[slot] = freeform[slot];
    }
  });

  return out;
}


function resolveFieldInto_(out, slot, value, rows) {
  if (!value) {
    return;
  }

  const found = resolveValue_(value, rows);

  if (found) {
    out[slot] = found;
  }
}


function resolveValue_(value, rows) {
  const target = normalize_(value);

  if (!target) {
    return null;
  }

  const candidates = [];

  rows.forEach(row => {
    const alias = normalize_(row.alias);
    const canonical = normalize_(row.canonical);

    if (
      target === alias ||
      target === canonical ||
      (alias && target.indexOf(alias) !== -1)
    ) {
      candidates.push({
        exact: target === alias || target === canonical,
        length: alias.length,
        row
      });
    }
  });

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => {
    if (a.exact !== b.exact) {
      return a.exact ? -1 : 1;
    }

    return b.length - a.length;
  });

  return {
    entryKey: candidates[0].row.entry_key,
    row: candidates[0].row
  };
}


function parseFreeform_(text, db) {
  const out = {};
  const normalized = normalize_(text);

  if (!normalized) {
    return out;
  }

  const pools = [
    ['GROUP', db.group],
    ['MEMBER', db.member],
    ['RELEASE', db.release],
    ['STORE', db.store],
    ['TYPE', db.type]
  ];

  const matches = [];

  pools.forEach(pair => {
    const sourceSlot = pair[0];
    const rows = pair[1];

    rows.forEach(row => {
      const alias = normalize_(row.alias);

      if (alias && normalized.indexOf(alias) !== -1) {
        matches.push({
          sourceSlot,
          length: alias.length,
          row
        });
      }
    });
  });

  matches.sort((a, b) => b.length - a.length);

  matches.forEach(match => {
    let slot = match.sourceSlot;

    if (slot === 'TYPE') {
      if (match.row.entry_key === 'region') {
        slot = 'REGION';
      } else if (match.row.entry_key === 'overseas_venue') {
        slot = 'VENUE';
      } else if (
        match.row.entry_key === 'venue' &&
        match.row.alias_kind === 'ja_design'
      ) {
        slot = 'VERSION';
      } else if (match.row.entry_key === 'cardword') {
        slot = 'CARD';
      } else {
        slot = 'TYPE';
      }
    }

    if (!out[slot]) {
      out[slot] = {
        entryKey: match.row.entry_key,
        row: match.row
      };
    }
  });

  return out;
}


/* =========================================================
 * Alias helpers
 * ======================================================= */

function memberAliases_(resolved, input, db) {
  if (!resolved.MEMBER) {
    return {};
  }

  const key = resolved.MEMBER.entryKey;
  const rows = activeEntryRows_(db.member, key);
  const ja = aliasByKind_(db.member, key, ['ja_primary']);
  const en = aliasByKind_(db.member, key, ['en_official']);

  let primary = ja || (rows[0] ? rows[0].alias : '');
  const inputText = input.member || (resolved.MEMBER.row ? resolved.MEMBER.row.alias : '');
  const inputRow = rows.find(row => normalize_(row.alias) === normalize_(inputText));

  if (
    inputRow &&
    ['ja_typo', 'ja_variant'].includes(inputRow.alias_kind)
  ) {
    primary = inputRow.alias;
  }

  return {
    key,
    primary,
    en,
    inputRow
  };
}


function releaseAliases_(resolved, input, db) {
  if (!resolved.RELEASE) {
    return {};
  }

  const key = resolved.RELEASE.entryKey;
  const rows = activeEntryRows_(db.release, key);
  const inputRow = resolved.RELEASE.row;

  let official =
    aliasByKind_(db.release, key, ['type_official']) ||
    aliasByKind_(db.release, key, ['en_spaced']) ||
    aliasByKind_(db.release, key, ['album_official']) ||
    aliasByKind_(db.release, key, ['tour_title']) ||
    aliasByKind_(db.release, key, ['single2']) ||
    aliasByKind_(db.release, key, ['title_track']) ||
    (rows[0] ? rows[0].alias : '');

  let primary = official;

  if (
    inputRow &&
    isOutputAlias_(inputRow) &&
    !['legacy_wrong', 'confusable', 'ja_unverified'].includes(inputRow.alias_kind)
  ) {
    primary = inputRow.alias;
  }

  const step1Variants = primary ? [primary] : [];

  if (inputRow && !isOutputAlias_(inputRow)) {
    specificReleaseAlts_({
      key,
      primary
    }, db).forEach(alias => {
      if (!step1Variants.includes(alias)) {
        step1Variants.push(alias);
      }
    });
  }

  return {
    key,
    primary,
    inputRow,
    step1Variants
  };
}


function storeAliases_(resolved, input, db) {
  if (!resolved.STORE) {
    return {};
  }

  const key = resolved.STORE.entryKey;
  const rows = activeEntryRows_(db.store, key);

  return {
    key,
    primary: rows[0] ? rows[0].alias : (resolved.STORE.row ? resolved.STORE.row.alias : ''),
    inputRow: resolved.STORE.row
  };
}


function typeAliases_(resolved, input, db) {
  if (!resolved.TYPE) {
    return {};
  }

  const key = resolved.TYPE.entryKey;
  const rows = activeEntryRows_(db.type, key);
  const inputText = input.type || (resolved.TYPE.row ? resolved.TYPE.row.alias : '');

  const exact = rows.find(row => normalize_(row.alias) === normalize_(inputText));

  return {
    key,
    primary: exact ? exact.alias : (rows[0] ? rows[0].alias : inputText),
    inputRow: resolved.TYPE.row
  };
}


function venueAliases_(resolved, input, db) {
  if (!resolved.VENUE) {
    return {};
  }

  const key = resolved.VENUE.entryKey;
  const source =
    db.release.some(row => row.entry_key === key)
      ? db.release
      : db.type;

  const rows = activeEntryRows_(source, key);
  const inputText = input.venue || (resolved.VENUE.row ? resolved.VENUE.row.alias : '');
  const exact = rows.find(row => normalize_(row.alias) === normalize_(inputText));

  return {
    key,
    primary: exact ? exact.alias : (rows[0] ? rows[0].alias : inputText),
    inputRow: resolved.VENUE.row
  };
}


function versionAliases_(resolved, input, db) {
  if (!resolved.VERSION) {
    return {};
  }

  return {
    key: resolved.VERSION.entryKey,
    primary: input.version || (resolved.VERSION.row ? resolved.VERSION.row.alias : '')
  };
}


function regionAliases_(resolved, input, db) {
  if (!resolved.REGION) {
    return {};
  }

  const key = resolved.REGION.entryKey;
  const rows = activeEntryRows_(db.type, key);
  const inputText = input.region || (resolved.REGION.row ? resolved.REGION.row.alias : '');
  const exact = rows.find(row => normalize_(row.alias) === normalize_(inputText));
  const primary = exact ? exact.alias : (rows[0] ? rows[0].alias : inputText);

  return {
    key,
    primary,
    alts: rows
      .filter(row => normalize_(row.alias) !== normalize_(primary))
      .map(row => row.alias)
  };
}


function strongestMemberAlt_(member, resolved, db) {
  if (!member.primary || !resolved.MEMBER) {
    return '';
  }

  const key = resolved.MEMBER.entryKey;

  const alt =
    aliasByKind_(db.member, key, ['ja_variant']) ||
    aliasByKind_(db.member, key, ['ja_typo']);

  if (!alt || normalize_(alt) === normalize_(member.primary)) {
    return '';
  }

  return alt;
}


function specificReleaseAlts_(release, db) {
  if (!release || !release.key) {
    return [];
  }

  const kindsByKey = {
    'hot-sauce': ['en_nospace'],
    'wegoup': ['type_official', 'en_spaced'],
    'i-like-it': ['en_nospace'],
    'sugarhoneyicetea': ['type_official', 'en_spaced'],
    'mons7er': ['album_official', 'album_long'],
    'love-monstiez': ['confusable'],
    'world-tour': ['en_generic', 'en_nospace']
  };

  const kinds = kindsByKey[release.key] || [];
  const out = [];

  kinds.forEach(kind => {
    activeEntryRows_(db.release, release.key)
      .filter(row => row.alias_kind === kind)
      .forEach(row => {
        if (
          normalize_(row.alias) !== normalize_(release.primary) &&
          !out.includes(row.alias)
        ) {
          out.push(row.alias);
        }
      });
  });

  return out;
}


function firstNoSpaceReleaseAlias_(key, db) {
  const rows = activeEntryRows_(db.release, key);

  const found = rows.find(row =>
    row.alias.indexOf(' ') === -1 &&
    ['type_official', 'en_nospace'].includes(row.alias_kind)
  );

  return found ? found.alias : '';
}


function aliasByKind_(rows, key, kinds) {
  const entryRows = activeEntryRows_(rows, key);

  for (let i = 0; i < kinds.length; i++) {
    const row = entryRows.find(r => r.alias_kind === kinds[i]);

    if (row) {
      return row.alias;
    }
  }

  return '';
}


function activeEntryRows_(rows, key) {
  return rows
    .filter(row => row.entry_key === key && isOutputAlias_(row))
    .sort(prioritySort_);
}


function prioritySort_(a, b) {
  const pa = Number(a.priority || 9999);
  const pb = Number(b.priority || 9999);

  if (pa !== pb) {
    return pa - pb;
  }

  return String(a.alias || '').localeCompare(String(b.alias || ''));
}


function isOutputAlias_(row) {
  if (!row) {
    return false;
  }

  return (
    String(row.pilot01_use).toUpperCase() === 'TRUE' &&
    String(row.search_step) !== 'X'
  );
}


/* =========================================================
 * Advisory
 * ======================================================= */

function advisoryNotes_(input, resolved, slots, rules) {
  const notes = [];

  const add = (id, fallback) => {
    if (notes.some(note => note.id === id)) {
      return;
    }

    const fromRules = advisoryFromRules_(rules, id);

    notes.push({
      id,
      text: fromRules || fallback
    });
  };

  const informationCount = [
    slots.member.primary,
    slots.release.primary,
    slots.store.primary,
    slots.type.primary,
    slots.venue.primary,
    slots.version.primary,
    slots.region.primary
  ].filter(Boolean).length;

  if (informationCount <= 1) {
    add('A1', '候補が多くなります。シリーズや配布元が分かると絞れます。');
  }

  if (
    slots.type.key === 'venue' &&
    ['複数会場', 'オンラインくじ', 'Wチャンス賞'].some(v =>
      normalize_(input.type).indexOf(normalize_(v)) !== -1
    )
  ) {
    add('A3', 'この区分は単品での出品がほとんどありません。セット出品が中心です。');
  }

  if (
    resolved.RELEASE &&
    resolved.RELEASE.row &&
    resolved.RELEASE.row.alias_kind === 'confusable'
  ) {
    add('A4', '入力されたシリーズ名は混同されやすいため、近い正式名でも検索します。');
  }

  if (input.freeform && /[\uac00-\ud7a3]/.test(input.freeform)) {
    add('A5', 'ハングルのままでは日本のMercariで当たりにくいため、カナ・英字へ変換して検索します。');
  }

  if (
    slots.version.primary ||
    slots.venue.primary ||
    (slots.store.primary && !slots.release.primary)
  ) {
    add('A6', '同じ区分に絵柄違いが複数ある場合があります。1枚に絞るには画像確認が必要です。');
  }

  return notes;
}


function advisoryFromRules_(rules, id) {
  try {
    const codes = rules.advisory_notes.codes || [];
    const found = codes.find(item => item.id === id);

    return found ? found.show : '';
  } catch (e) {
    return '';
  }
}


/* =========================================================
 * Dataset installer
 * ======================================================= */

function entryOptions_(rows, filterFn) {
  const seen = {};

  rows.forEach(row => {
    if (!isOutputAlias_(row)) {
      return;
    }

    if (filterFn && !filterFn(row)) {
      return;
    }

    if (!seen[row.entry_key]) {
      seen[row.entry_key] = {
        id: row.entry_key,
        name: row.canonical
      };
    }
  });

  return Object.keys(seen)
    .sort()
    .map(key => seen[key]);
}


function buildVenueOptions_(db) {
  const values = [];

  db.release.forEach(row => {
    if (
      isOutputAlias_(row) &&
      [
        'venue_ja',
        'venue_ja2',
        'venue_ja3',
        'venue_multi',
        'tour_abbrev',
        'ja_tour_abbrev'
      ].includes(row.alias_kind)
    ) {
      values.push(row.alias);
    }
  });

  db.type.forEach(row => {
    if (
      isOutputAlias_(row) &&
      row.entry_key === 'overseas_venue'
    ) {
      values.push(row.alias);
    }
  });

  return unique_(values);
}


/* =========================================================
 * Regression helpers
 * ======================================================= */

function queryCovered_(query, steps, targetStep) {
  const key = queryDedupKey_(query);

  for (let step = 1; step <= targetStep; step++) {
    const list = steps[String(step)] || [];

    if (list.some(item => queryDedupKey_(item.query) === key)) {
      return true;
    }
  }

  return false;
}


/* =========================================================
 * Research mail
 * ======================================================= */

function sanitizeInput_(raw) {
  return {
    group: CONFIG.DEFAULT_GROUP,
    member: cleanText_(raw.member, CONFIG.MAX_FIELD),
    release: cleanText_(raw.release, CONFIG.MAX_FIELD),
    store: cleanText_(raw.store, CONFIG.MAX_FIELD),
    type: cleanText_(raw.type, CONFIG.MAX_FIELD),
    venue: cleanText_(raw.venue, CONFIG.MAX_FIELD),
    version: cleanText_(raw.version, CONFIG.MAX_FIELD),
    region: cleanText_(raw.region, CONFIG.MAX_FIELD),
    freeform: cleanText_(raw.freeform, 300),
    want: cleanText_(raw.want, 50),
    memo: cleanText_(raw.memo, CONFIG.MAX_MEMO)
  };
}


function cleanText_(value, maxLength) {
  if (value === null || value === undefined) {
    return '';
  }

  let text = String(value);

  if (text.normalize) {
    text = text.normalize('NFKC');
  }

  text = text.replace(/\s+/g, ' ').trim();

  return text.slice(0, maxLength || CONFIG.MAX_FIELD);
}


function normalize_(value) {
  let text = String(value || '');

  if (text.normalize) {
    text = text.normalize('NFKC');
  }

  return text
    .toLowerCase()
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function queryDedupKey_(query) {
  return normalize_(query)
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ');
}


function rawTokenCount_(values) {
  return (values || [])
    .filter(Boolean)
    .reduce((sum, value) => {
      return sum + String(value).trim().split(/\s+/).filter(Boolean).length;
    }, 0);
}


function unique_(values) {
  const seen = {};
  const out = [];

  (values || []).forEach(value => {
    const key = normalize_(value);

    if (!key || seen[key]) {
      return;
    }

    seen[key] = true;
    out.push(value);
  });

  return out;
}


function displayCanonical_(rows, key) {
  if (!key) {
    return '';
  }

  const row = rows.find(r => r.entry_key === key);

  return row ? row.canonical : '';
}


function flattenGenerated_(steps) {
  const out = [];

  ['1', '2', '3'].forEach(step => {
    (steps[step] || []).forEach(item => {
      out.push({
        step: Number(step),
        priority: item.priority,
        query: item.query
      });
    });
  });

  return out;
}



export {generateCore_ as generate, sanitizeInput_ as sanitize, entryOptions_ as entryOptions, buildVenueOptions_ as venueOptions};
