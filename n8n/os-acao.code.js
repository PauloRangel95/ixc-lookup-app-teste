// os-acao — ESCRITA de OS no IXC. DEPLOY NO n8n DE TESTE (testes-n8n-testes...).
// Fase 1 (segura): acao='mensagem' registra uma observação na OS. NÃO muda status.
// Trava: nesta fase só aceita a OS de teste.
// Entrada: { acao:'mensagem', id_chamado, mensagem, id_tecnico }
const IXC_BASE  = 'https://ixc.carajasnet.com/webservice/v1';
// Cole o MESMO auth do IXC que a produção usa. Aceita 2 formatos:
//  - o blob base64 que vem depois de "Basic " no header Authorization da produção; OU
//  - "usuario:token" (que o código codifica em base64 sozinho).
const IXC_AUTH  = 'COLE_BASE64_OU_usuario:token';
const SOMENTE_OS_TESTE = '1167568';            // '' = libera geral (só depois de validado)

function authHeader(){
  let v = String(IXC_AUTH).replace(/^Basic\s+/i,'').trim();
  if (v.includes(':')) v = Buffer.from(v, 'utf8').toString('base64'); // "usuario:token" -> base64
  return 'Basic ' + v;
}

const body = $input.first().json.body || $input.first().json;
const acao = String(body.acao || '').trim();
const idChamado = String(body.id_chamado || '').trim();
if (!idChamado) return [{ json:{ ok:false, erro:'id_chamado é obrigatório' } }];
if (SOMENTE_OS_TESTE && idChamado !== SOMENTE_OS_TESTE)
  return [{ json:{ ok:false, erro:'nesta fase só a OS de teste '+SOMENTE_OS_TESTE } }];

function nowIX(){ const d=new Date(), p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
async function ixcWrite(endpoint, payload){
  return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
    headers:{ 'Authorization':authHeader(), 'Content-Type':'application/json' }, body: payload, json:true });
}
function errInfo(e){ const c=e.httpCode||e.statusCode||(e.response&&e.response.statusCode)||''; let d='';
  try{ const b=e.response&&e.response.body; if(b) d=typeof b==='string'?b:JSON.stringify(b); }catch(_){}
  return 'IXC: HTTP '+c+' '+(e.message||'')+(d?(' :: '+String(d).slice(0,500)):''); }

try {
  if (acao === 'mensagem'){
    const msg = String(body.mensagem || '').trim();
    if (!msg) return [{ json:{ ok:false, erro:'mensagem é obrigatória' } }];
    const payload = { id_chamado:idChamado, mensagem:msg, id_tecnico:String(body.id_tecnico||''), data_inicio:nowIX(), data_final:nowIX() };
    const r = await ixcWrite.call(this, 'su_oss_chamado_mensagem', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  return [{ json:{ ok:false, erro:'ação ainda não suportada: '+acao } }];
} catch(e){
  return [{ json:{ ok:false, erro: errInfo(e) } }];
}
