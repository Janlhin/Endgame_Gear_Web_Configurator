// 极简 Markdown → HTML（只覆盖 docs/test-checklist.md 用到的子集）
//
// 为什么需要它：测试清单要**同时**有两种形态 ——
//   · docs/test-checklist.md：仓库里可读、可 diff、可评审（单一真相源）
//   · index.html 内嵌：志愿者拿到的是单文件工具，离线双击就能看
// 手抄两份必然漂移，所以在构建时把 md 渲染进模板（build.mjs 调用）。
//
// 不引第三方 markdown 解析器：产物必须零依赖、可离线、构建可复现。
// 覆盖范围刻意写窄，遇到不支持的语法宁可不渲染，也不要产出错 HTML。
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s) => s.replace(/[&<>]/g, (c) => ESC[c]);

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

const isTableSep = (l) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(l) && l.includes("-");

export function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let para = [];
  const flushPara = () => { if (para.length) { out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; } };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];

    if (/^```/.test(l)) {                                   // 围栏代码块
      flushPara();
      const buf = [];
      for (i++; i < lines.length && !/^```/.test(lines[i]); i++) buf.push(lines[i]);
      out.push("<pre><code>" + esc(buf.join("\n")) + "</code></pre>");
      continue;
    }
    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {                                                // 标题
      flushPara();
      const lv = Math.min(6, h[1].length + 2);              // md 的 h1 映射到页面 h3，避免和页面标题打架
      out.push(`<h${lv}>${inline(h[2])}</h${lv}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(l.trim())) { flushPara(); out.push("<hr>"); continue; }

    if (/^>/.test(l)) {                                     // 引用块
      flushPara();
      const buf = [];
      while (i < lines.length && (/^>/.test(lines[i]) || lines[i].trim() === ">")) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      i--;
      out.push("<blockquote>" + mdToHtml(buf.join("\n")) + "</blockquote>");
      continue;
    }

    if (l.trim().startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara();
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(cells(lines[i])); i++; }
      i--;
      out.push("<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") +
        "</tr></thead><tbody>" +
        rows.map((r) => "<tr>" + r.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") +
        "</tbody></table>");
      continue;
    }

    const li = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {                                               // 列表（含 - [ ] 勾选框）
      flushPara();
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
        if (!m) {
          // 续行（缩进的说明文字）并入上一项
          if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i])) {
            items[items.length - 1] += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        let text = m[3];
        const cb = text.match(/^\[([ xX])\]\s*(.*)$/);      // 任务列表
        if (cb) { text = `<input type="checkbox" disabled> ${cb[2]}`; items.push("<li>" + inline(text) + "</li>"); }
        else items.push("<li>" + inline(text) + "</li>");
        i++;
      }
      i--;
      out.push((ordered ? "<ol>" : "<ul>") + items.join("") + (ordered ? "</ol>" : "</ul>"));
      continue;
    }

    if (!l.trim()) { flushPara(); continue; }
    para.push(l.trim());
  }
  flushPara();
  return out.join("\n");
}
