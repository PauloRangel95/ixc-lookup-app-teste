// os-acao — ESCRITA/LEITURA de OS no IXC. DEPLOY NO n8n DE TESTE.
// Leitura (sem trava): acao='eventos' | 'respostas' | 'os' (id_chamado)
// Escrita (trava OS teste): acao='mensagem' { id_chamado, mensagem, id_tecnico, id_evento?, status?, tipo_cobranca? }
const IXC_BASE  = 'https://ixc.carajasnet.com/webservice/v1';
const IXC_AUTH  = 'COLE_BASE64_OU_usuario:token'; // mesmo auth do ixc-leituras (base64 após "Basic ", OU "usuario:token")
const SOMENTE_OS_TESTE = '';                       // ex.: '1167584' p/ travar; '' = sem trava (cuidado)

function authHeader(){ let v=String(IXC_AUTH).replace(/^Basic\s+/i,'').trim(); if(v.includes(':')) v=Buffer.from(v,'utf8').toString('base64'); return 'Basic '+v; }
function nowIX(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
async function ixcWrite(endpoint, payload){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'Content-Type':'application/json' }, body:payload, json:true }); }
async function ixcList(endpoint, params){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'ixcsoft':'listar', 'Content-Type':'application/json' }, body:params||{}, json:true }); }
function errInfo(e){ const c=e.httpCode||e.statusCode||(e.response&&e.response.statusCode)||''; let d=''; try{ const b=e.response&&e.response.body; if(b) d=typeof b==='string'?b:JSON.stringify(b); }catch(_){} return 'IXC: HTTP '+c+' '+(e.message||'')+(d?(' :: '+String(d).slice(0,700)):''); }

const body = $input.first().json.body || $input.first().json;
const acao = String(body.acao || '').trim();

try {
  // ── RAW (TESTE/descoberta — REMOVER antes de ir pra produção) ──
  if (acao === 'raw'){
    const ep = String(body.endpoint||'').trim(); const pl = body.payload||{};
    if (!ep) return [{ json:{ ok:false, erro:'endpoint é obrigatório no raw' } }];
    const r = await ixcWrite.call(this, ep, pl);
    return [{ json:{ ok:true, endpoint:ep, payload_enviado:pl, resposta:r } }];
  }
  // ── LEITURA (sem trava) ──
  if (acao === 'eventos'){
    const r = await ixcList.call(this,'su_oss_evento',{ qtype:'su_oss_evento.id', query:'0', oper:'>', rp:'200', page:'1', sortname:'su_oss_evento.id', sortorder:'asc' });
    return [{ json:{ ok:true, total:(r&&r.total), eventos:(r&&r.registros)||r } }];
  }
  if (acao === 'respostas'){
    const r = await ixcList.call(this,'su_oss_respostas',{ qtype:'su_oss_respostas.id', query:'0', oper:'>', rp:'200', page:'1', sortname:'su_oss_respostas.id', sortorder:'asc' });
    return [{ json:{ ok:true, total:(r&&r.total), respostas:(r&&r.registros)||r } }];
  }
  if (acao === 'os'){
    const id=String(body.id_chamado||'').trim(); if(!id) return [{ json:{ ok:false, erro:'id_chamado' } }];
    const r = await ixcList.call(this,'su_oss_chamado',{ qtype:'su_oss_chamado.id', query:id, oper:'=', rp:'1', page:'1', sortname:'su_oss_chamado.id', sortorder:'asc' });
    return [{ json:{ ok:true, os:(r&&r.registros&&r.registros[0])||null } }];
  }

  // ── ESCRITA (trava OS teste) ──
  const idChamado = String(body.id_chamado || '').trim();
  if (!idChamado) return [{ json:{ ok:false, erro:'id_chamado é obrigatório' } }];
  if (SOMENTE_OS_TESTE && idChamado !== SOMENTE_OS_TESTE) return [{ json:{ ok:false, erro:'nesta fase só a OS '+SOMENTE_OS_TESTE } }];

  if (acao === 'mensagem'){
    const msg = String(body.mensagem || '').trim();
    if (!msg) return [{ json:{ ok:false, erro:'mensagem é obrigatória' } }];
    const payload = { id_chamado:idChamado, mensagem:msg, id_tecnico:String(body.id_tecnico||''), data_inicio:nowIX(), data_final:nowIX(),
      tipo_cobranca: (body.tipo_cobranca!=null?String(body.tipo_cobranca):'N') };
    if (body.id_evento) payload.id_evento = String(body.id_evento);
    if (body.status)    payload.status    = String(body.status);
    const r = await ixcWrite.call(this, 'su_oss_chamado_mensagem', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, payload_enviado:payload, resposta:r } }];
  }
  return [{ json:{ ok:false, erro:'ação não suportada: '+acao } }];
} catch(e){
  return [{ json:{ ok:false, erro: errInfo(e) } }];
}
