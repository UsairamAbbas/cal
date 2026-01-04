/* ProdCalc web — Material design
   Features:
   - Shunting-yard parser + RPN evaluator (supports unary -, ^, %, parentheses)
   - Responsive UI, keyboard, history, animations (ripple), voice stub
*/

(() => {
  // UI bindings
  const exprEl = document.getElementById('expr');
  const valueEl = document.getElementById('value');
  const buttons = Array.from(document.querySelectorAll('.btn'));
  const historyPanel = document.getElementById('historyPanel');
  const historyToggle = document.getElementById('historyToggle');
  const historyList = document.getElementById('historyList');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const themeToggle = document.getElementById('themeToggle');
  const voiceBtn = document.getElementById('voiceBtn');

  // State
  let expression = '';
  let lastResult = null;
  let history = [];

  // ---------- Parser: Tokenize, shunting-yard, RPN ----------
  function isDigit(c){ return /\d/.test(c); }
  function isWhite(c){ return /\s/.test(c); }
  function isOperator(c){ return ['+','-','*','/','^'].includes(c); }

  function precedence(op){
    if(op === '+' || op === '-') return 1;
    if(op === '*' || op === '/') return 2;
    if(op === '^') return 3;
    return 0;
  }

  function isRightAssoc(op){ return op === '^'; }

  // tokenize with unary minus handling
  function tokenize(s){
    let tokens = [];
    let i=0;
    while(i<s.length){
      const c = s[i];
      if(isWhite(c)){ i++; continue; }
      if(isDigit(c) || c === '.'){
        let j=i; while(j<s.length && (/[\d.]/.test(s[j]))) j++;
        tokens.push({type:'num', value: s.slice(i,j)});
        i=j; continue;
      }
      if(c === '(' || c === ')'){ tokens.push({type:c}); i++; continue; }
      if(c === '%'){ tokens.push({type:'percent'}); i++; continue; }
      if(isOperator(c)){
        // detect unary minus or plus
        const prev = tokens.length ? tokens[tokens.length-1] : null;
        if((c === '+' || c === '-') && (!prev || prev.type === '(' || prev.type === 'op')){
          // unary: represent as 0 <op> number by putting a '0' before it
          tokens.push({type:'num', value:'0'});
        }
        tokens.push({type:'op', value:c});
        i++; continue;
      }
      // functions: sqrt
      if(/[a-z]/i.test(c)){
        let j=i; while(j<s.length && /[a-z0-9]/i.test(s[j])) j++;
        const name = s.slice(i,j);
        tokens.push({type:'func', value:name});
        i=j; continue;
      }
      // unknown char
      throw new Error('Invalid character: ' + c);
    }
    return tokens;
  }

  function toRPN(tokens){
    let out = [];
    let ops = [];
    for(let t of tokens){
      if(t.type === 'num'){ out.push(t); }
      else if(t.type === 'func'){ ops.push(t); }
      else if(t.type === 'percent'){ out.push(t); out.push({type:'op', value:'%'}); }
      else if(t.type === 'op'){
        while(ops.length){
          const top = ops[ops.length-1];
          if(top.type === 'op' && ((isRightAssoc(t.value) && precedence(t.value) < precedence(top.value)) || (!isRightAssoc(t.value) && precedence(t.value) <= precedence(top.value)))){
            out.push(ops.pop());
          } else break;
        }
        ops.push(t);
      } else if(t.type === '('){ ops.push(t); }
      else if(t.type === ')'){
        while(ops.length && ops[ops.length-1].type !== '(') out.push(ops.pop());
        if(!ops.length) throw new Error('Mismatched parentheses');
        ops.pop(); // pop '('
        if(ops.length && ops[ops.length-1].type === 'func') out.push(ops.pop());
      } else {
        // push raw
      }
    }
    while(ops.length){
      const x = ops.pop();
      if(x.type === '(' || x.type === ')') throw new Error('Mismatched parentheses');
      out.push(x);
    }
    return out;
  }

  function callFunc(name, args){
    if(name === 'sqrt') return Math.sqrt(args[0]);
    throw new Error('Unknown function: ' + name);
  }

  function evalRPN(rpn){
    let st = [];
    for(let t of rpn){
      if(t.type === 'num') st.push(Number(t.value));
      else if(t.type === 'op'){
        if(t.value === '%'){
          if(!st.length) throw new Error('Invalid percent');
          const a = st.pop();
          st.push(a / 100);
        } else {
          if(st.length < 2) throw new Error('Invalid expression');
          const b = st.pop(), a = st.pop();
          switch(t.value){
            case '+': st.push(a + b); break;
            case '-': st.push(a - b); break;
            case '*': st.push(a * b); break;
            case '/':
              if(b === 0) throw new Error('Divide by zero');
              st.push(a / b); break;
            case '^': st.push(Math.pow(a,b)); break;
            default: throw new Error('Unknown op ' + t.value);
          }
        }
      } else if(t.type === 'func'){
        if(!st.length) throw new Error('Func missing arg');
        const a = st.pop();
        st.push(callFunc(t.value, [a]));
      }
    }
    if(st.length !== 1) throw new Error('Invalid expression');
    return st[0];
  }

  function evaluateExpression(s){
    if(!s || !s.trim()) return 0;
    const tokens = tokenize(s);
    const rpn = toRPN(tokens);
    const res = evalRPN(rpn);
    return res;
  }

  // ---------- UI updates ----------
  function setExpr(s){
    expression = s;
    exprEl.textContent = s;
  }
  function animateValue(newVal){
    valueEl.style.opacity = 0;
    setTimeout(()=>{ valueEl.textContent = newVal; valueEl.style.transform = 'translateY(6px)'; }, 120);
    setTimeout(()=>{ valueEl.style.opacity = 1; valueEl.style.transform = 'translateY(0)'; }, 150);
  }

  function formatNumber(n){
    if(!isFinite(n)) return 'Error';
    // trim trailing zeros
    if(Math.abs(n - Math.round(n)) < 1e-12) return String(Math.round(n));
    let s = n.toFixed(12);
    s = s.replace(/\.?0+$/, '');
    return s;
  }

  // ---------- command processing ----------
  function pushHistoryItem(expr, result){
    history.unshift({expr, result});
    if(history.length > 100) history.pop();
    renderHistory();
  }
  function renderHistory(){
    historyList.innerHTML = '';
    for(let item of history){
      const li = document.createElement('li');
      li.innerHTML = `<div style="font-size:13px;color:#4b5563">${item.expr}</div><div style="font-weight:600">${item.result}</div>`;
      li.addEventListener('click', ()=>{ setExpr(item.expr); animateValue(item.result); });
      historyList.appendChild(li);
    }
  }

  function handleCommand(cmd){
    try{
      if(cmd === 'AC'){
        setExpr('');
        animateValue('0');
      } else if(cmd === '±'){
        // flip sign of current entry: alter last number
        if(!expression) { setExpr('-'); animateValue('0'); return; }
        // find last number token
        let m = expression.match(/(.*?)(-?\d*\.?\d+)$/);
        if(m){
          const before = m[1];
          const last = m[2];
          if(last.startsWith('-')) setExpr(before + last.slice(1)); else setExpr(before + '-' + last);
        } else {
          // if no number, prefix '-'
          setExpr('-' + expression);
        }
      } else if(cmd === '%'){
        setExpr(expression + '%');
      } else if(cmd === '='){
        const res = evaluateExpression(expression);
        const str = formatNumber(res);
        pushHistoryItem(expression, str);
        lastResult = res;
        setExpr(String(str));
        animateValue(str);
      } else {
        // generic append
        setExpr(expression + cmd);
        // live-evaluate (best-effort)
        try {
          const v = evaluateExpression(expression + cmd);
          animateValue(formatNumber(v));
        } catch(e){
          // don't spam errors on partial input
        }
      }
    } catch(err){
      animateValue('Error');
      console.warn(err);
    }
  }

  // ---------- events ----------
  buttons.forEach(btn => {
    btn.addEventListener('click', (ev) => {
      // ripple
      const r = document.createElement('span');
      r.className = 'ripple';
      const rect = btn.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      r.style.width = r.style.height = size + 'px';
      r.style.left = (ev.clientX - rect.left - size/2) + 'px';
      r.style.top = (ev.clientY - rect.top - size/2) + 'px';
      btn.appendChild(r);
      setTimeout(()=> r.remove(), 600);
      // command
      const cmd = btn.dataset.cmd;
      handleCommand(cmd);
    });
  });

  // keyboard
  window.addEventListener('keydown', (ev) => {
    if(ev.key === 'Enter') { ev.preventDefault(); handleCommand('='); return; }
    if(ev.key === 'Backspace'){ ev.preventDefault(); setExpr(expression.slice(0,-1)); return; }
    const allowed = '0123456789.+-*/()%^';
    if(allowed.includes(ev.key)){
      ev.preventDefault();
      handleCommand(ev.key === '*' ? '*' : ev.key);
    }
  });

  // history toggle
  historyToggle.addEventListener('click', ()=> {
    if(historyPanel.classList.contains('hidden')) historyPanel.classList.remove('hidden');
    else historyPanel.classList.add('hidden');
  });
  clearHistoryBtn.addEventListener('click', ()=>{ history = []; renderHistory(); });

  // theme toggle (simple)
  let dark = false;
  themeToggle.addEventListener('click', ()=>{
    dark = !dark;
    if(dark){
      document.documentElement.style.setProperty('--bg', '#0f1724');
      document.documentElement.style.setProperty('--card', '#0b1220');
      document.documentElement.style.setProperty('--text', '#e6eef8');
      document.documentElement.style.setProperty('--muted', '#9aa4b2');
    } else {
      document.documentElement.style.removeProperty('--bg');
      document.documentElement.style.removeProperty('--card');
      document.documentElement.style.removeProperty('--text');
      document.documentElement.style.removeProperty('--muted');
    }
  });

  // simple voice input stub (uses Web Speech API if available; falls back to prompt)
  voiceBtn.addEventListener('click', async ()=>{
    if(!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)){
      const phrase = prompt('Voice stub: type expression to simulate:');
      if(phrase) { setExpr(expression + phrase); try { animateValue(formatNumber(evaluateExpression(expression + phrase))); } catch(e){} }
      return;
    }
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new Rec();
    r.lang = 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (evt) => {
      const txt = evt.results[0][0].transcript.replace(/times/gi,'*').replace(/divided by/gi,'/').replace(/plus/gi,'+').replace(/minus/gi,'-');
      setExpr(expression + txt);
    };
    r.onerror = (e) => alert('Speech error: ' + e.error);
    r.start();
  });

  // init
  setExpr('');
  animateValue('0');

  // expose for debugging
  window.ProdCalc = { evaluateExpression, setExpr, history };

})();
