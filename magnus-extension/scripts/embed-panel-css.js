#!/usr/bin/env node
/* Regenerates panel-loader.js from panel.css after you edit panel.css */
const fs = require('fs')
const path = require('path')
const dir = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(dir, 'panel.css'), 'utf8')
const head =
  '/** Auto-generated from panel.css — run: node scripts/embed-panel-css.js */\n'
const body =
  ';(function(){var css=' +
  JSON.stringify(css) +
  ';var s=document.createElement("style");s.setAttribute("data-magnus","panel");s.textContent=css;var r=document.head||document.documentElement;r.insertBefore(s,r.firstChild);})();\n'
fs.writeFileSync(path.join(dir, 'panel-loader.js'), head + body)
console.log('panel-loader.js updated from panel.css')
