// os-acao — ESCRITA/LEITURA de OS no IXC. DEPLOY NO n8n DE TESTE.
// Leitura (sem trava): acao='eventos' | 'respostas' | 'os' (id_chamado)
// Escrita (trava OS teste): acao='mensagem' { id_chamado, mensagem, id_tecnico, id_evento?, status?, tipo_cobranca? }
const IXC_BASE  = 'https://ixc.carajasnet.com/webservice/v1';
const IXC_AUTH  = 'COLE_BASE64_OU_usuario:token'; // mesmo auth do ixc-leituras (base64 após "Basic ", OU "usuario:token")
const SOMENTE_OS_TESTE = '';                       // ex.: '1167584' p/ travar; '' = sem trava (cuidado)

function authHeader(){ let v=String(IXC_AUTH).replace(/^Basic\s+/i,'').trim(); if(v.includes(':')) v=Buffer.from(v,'utf8').toString('base64'); return 'Basic '+v; }
function nowIX(){ const d=new Date(), p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
// Datas de agendamento no IXC exigem formato BR dd/mm/aaaa hh:mm:ss
function brDate(ms){ const d=new Date(ms==null?Date.now():ms), p=n=>String(n).padStart(2,'0'); return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear()+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds()); }
async function ixcWrite(endpoint, payload){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'Content-Type':'application/json' }, body:payload, json:true }); }
async function ixcList(endpoint, params){ return await this.helpers.httpRequest({ method:'POST', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'ixcsoft':'listar', 'Content-Type':'application/json' }, body:params||{}, json:true }); }
async function ixcPut(endpoint, payload){ return await this.helpers.httpRequest({ method:'PUT', url:`${IXC_BASE}/${endpoint}`,
  headers:{ 'Authorization':authHeader(), 'Content-Type':'application/json' }, body:payload, json:true }); }
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
  if (acao === 'listar'){
    const ep = String(body.endpoint||'').trim(); if(!ep) return [{json:{ok:false,erro:'endpoint'}}];
    const params = body.params || { qtype:ep+'.id', query:'0', oper:'>', rp:'500', page:'1', sortname:ep+'.id', sortorder:'asc' };
    const r = await ixcList.call(this, ep, params);
    return [{json:{ok:true, endpoint:ep, total:(r&&r.total), registros:(r&&r.registros)||r}}];
  }

  // ── ESCRITA (trava OS teste) ──
  const idChamado = String(body.id_chamado || '').trim();
  if (!idChamado) return [{ json:{ ok:false, erro:'id_chamado é obrigatório' } }];
  if (SOMENTE_OS_TESTE && idChamado !== SOMENTE_OS_TESTE) return [{ json:{ ok:false, erro:'nesta fase só a OS '+SOMENTE_OS_TESTE } }];

  if (acao === 'mensagem'){
    const msg = String(body.mensagem || '').trim();
    if (!msg) return [{ json:{ ok:false, erro:'mensagem é obrigatória' } }];
    const payload = { id_chamado:idChamado, mensagem:msg, id_tecnico:String(body.id_tecnico||''), data_inicio:nowIX(), data_final:nowIX(),
      tipo_cobranca: (body.tipo_cobranca!=null?String(body.tipo_cobranca):'NENHUM') };
    if (body.id_evento) payload.id_evento = String(body.id_evento);
    if (body.status)    payload.status    = String(body.status);
    const r = await ixcWrite.call(this, 'su_oss_chamado_mensagem', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, payload_enviado:payload, resposta:r } }];
  }
  // MARCAR P/ AGENDAMENTO (técnico) → OS vai pra RAG; O&M reagenda depois. Datas em formato BR.
  if (acao === 'reagendar'){
    const now = brDate();
    const payload = { id_chamado:idChamado, status:'RAG', id_evento:'10',
      mensagem: String(body.mensagem || 'Marcada para agendamento pelo técnico.'),
      id_tecnico: String(body.id_tecnico||''),
      data: now, data_agendamento: now, data_agendamento_final: brDate(Date.now()+2*3600000) };
    const r = await ixcWrite.call(this, 'su_oss_chamado_reagendar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // INICIAR DESLOCAMENTO (1º passo) → status DS (via executar + evento 17)
  if (acao === 'deslocamento'){
    const payload = { id_chamado:idChamado, status:'DS', id_evento:'17',
      mensagem: String(body.mensagem || 'Iniciou deslocamento.'), id_tecnico: String(body.id_tecnico||''), data: brDate() };
    const r = await ixcWrite.call(this, 'su_oss_chamado_executar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // EXECUTAR (técnico começou/chegou) → status EX
  if (acao === 'executar'){
    const payload = { id_chamado:idChamado, status:'EX', id_evento:'9',
      mensagem: String(body.mensagem || 'Em execução.'), id_tecnico: String(body.id_tecnico||''), data: brDate() };
    const r = await ixcWrite.call(this, 'su_oss_chamado_executar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // FINALIZAR → status F (exige data_inicio e data_final)
  if (acao === 'finalizar'){
    const now = brDate();
    const payload = { id_chamado:idChamado, status:'F', id_evento:'6',
      mensagem: String(body.mensagem || 'Finalizada.'), id_tecnico: String(body.id_tecnico||''),
      data: now, data_inicio: now, data_final: now };
    if (body.id_resposta) payload.id_resposta = String(body.id_resposta);
    if (body.id_su_diagnostico) payload.id_su_diagnostico = String(body.id_su_diagnostico);
    const r = await ixcWrite.call(this, 'su_oss_chamado_fechar', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, resposta:r } }];
  }
  // ANEXO → anexa arquivo (base64) na OS. { arquivo (base64/dataURI), nome_arquivo?, descricao?, classificacao? }
  if (acao === 'anexo'){
    const arq = String(body.arquivo || '').trim();
    if (!arq) return [{ json:{ ok:false, erro:'arquivo (base64) é obrigatório' } }];
    const payload = { id_oss_chamado:idChamado, descricao:String(body.descricao||'Anexo'),
      classificacao_arquivo:String(body.classificacao||'P'), local_arquivo:arq };
    if (body.nome_arquivo) payload.nome_arquivo = String(body.nome_arquivo);
    const r = await ixcWrite.call(this, 'su_oss_chamado_arquivos', payload);
    return [{ json:{ ok:true, acao, id_chamado:idChamado, id:(r&&r.id)||null, resposta:r } }];
  }
  // AUTORIZAR ONU → provisiona na OLT REAL. Sequência oficial IXC. VLAN herdada da OLT (vizinho + comum).
  // body: get_id (ou id_fibra p/ reaproveitar), id_login, id_contrato, id_perfil, id_transmissor, onu_tipo, mac, slotno, ponno, nome
  //       vlan?/vlan_pppoe? (se não vier, deriva da OLT), somente_completar?('1' = só PUT, NÃO grava na OLT)
  if (acao === 'onu_autorizar'){
    const macReq = String(body.mac||'').trim().toUpperCase();
    let idFibra = String(body.id_fibra||'').trim();
    // Evita duplicar: se já existe registro de fibra pra esse MAC, reaproveita
    if(!idFibra && macReq){ try{ const gm=await ixcList.call(this,'radpop_radio_cliente_fibra',{ qtype:'radpop_radio_cliente_fibra.mac', query:macReq, oper:'=', rp:'1', page:'1', sortname:'radpop_radio_cliente_fibra.id', sortorder:'desc' }); const ex=(gm&&gm.registros&&gm.registros[0]); if(ex&&ex.id) idFibra=String(ex.id); }catch(_){} }
    // 1) autorizar (só se ainda não tem registro) → cria radpop_radio_cliente_fibra
    let r1=null;
    if(!idFibra){
      const getId = String(body.get_id||'').trim();
      if(!getId) return [{ json:{ ok:false, erro:'get_id (ou id_fibra) é obrigatório' } }];
      try{ r1 = await ixcWrite.call(this,'fh_onu_nao_autorizadas_22396',{ get_id:getId }); }
      catch(e){ return [{ json:{ ok:false, etapa:'autorizar', erro:errInfo(e) } }]; }
      idFibra = String((r1&&(r1.id||r1.id_cliente_fibra||r1.id_registro))||'').trim();
      if(!idFibra || (r1&&r1.type==='error')) return [{ json:{ ok:false, etapa:'autorizar', erro:'não retornou id do cliente fibra', resposta:r1 } }];
    }
    // 2) completa o registro: busca o atual e mescla os vínculos
    let cur={}; try{ const g=await ixcList.call(this,'radpop_radio_cliente_fibra',{ qtype:'radpop_radio_cliente_fibra.id', query:idFibra, oper:'=', rp:'1', page:'1' }); cur=(g&&g.registros&&g.registros[0])||{}; }catch(_){}
    // Puxa projeto/caixa/porta/transmissor do CADASTRO do login (radusuarios) — obrigatórios no PUT
    const idLogin = String(body.id_login||cur.id_login||'');
    let lg={}; if(idLogin){ try{ const gl=await ixcList.call(this,'radusuarios',{ qtype:'radusuarios.id', query:idLogin, oper:'=', rp:'1', page:'1' }); lg=(gl&&gl.registros&&gl.registros[0])||{}; }catch(_){} }
    const idTx = String(body.id_transmissor||cur.id_transmissor||lg.id_transmissor||'');
    const idProjeto = String(body.id_projeto||cur.id_projeto||lg.id_df_projeto||'');
    const idCaixa   = String(body.id_caixa_ftth||cur.id_caixa_ftth||lg.id_caixa_ftth||'');
    const portaFtth = String(body.porta_ftth!=null?body.porta_ftth:(cur.porta_ftth||lg.ftth_porta||''));
    // VLAN: usa a informada; senão herda da OLT (vlan/vlan_pppoe mais comuns entre os vizinhos do transmissor)
    let vlan=String(body.vlan||'').trim(), vlanP=String(body.vlan_pppoe||'').trim();
    if((!vlan||!vlanP) && idTx){ try{
      const gv=await ixcList.call(this,'radpop_radio_cliente_fibra',{ qtype:'radpop_radio_cliente_fibra.id_transmissor', query:idTx, oper:'=', rp:'80', page:'1', sortname:'radpop_radio_cliente_fibra.id', sortorder:'desc' });
      const regs=(gv&&gv.registros)||[]; const cnt={};
      regs.forEach(x=>{ const v=String(x.vlan||'').trim(); if(v&&v!=='0'){ const k=v+'|'+String(x.vlan_pppoe||'').trim(); cnt[k]=(cnt[k]||0)+1; } });
      const top=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
      if(top){ const pr=top.split('|'); if(!vlan)vlan=pr[0]; if(!vlanP)vlanP=pr[1]||''; }
    }catch(_){} }
    const upd = Object.assign({}, cur, {
      id: idFibra,
      id_login:       idLogin,
      id_contrato:    String(body.id_contrato||cur.id_contrato||lg.id_contrato||''),
      id_perfil:      String(body.id_perfil||cur.id_perfil||''),
      id_transmissor: idTx,
      id_projeto:     idProjeto,
      id_caixa_ftth:  idCaixa,
      porta_ftth:     portaFtth,
      onu_tipo:       String(body.onu_tipo||cur.onu_tipo||''),
      mac:            String(body.mac||cur.mac||''),
      slotno:         String(body.slotno||cur.slotno||''),
      ponno:          String(body.ponno||cur.ponno||''),
      vlan:           vlan||String(cur.vlan||''),
      vlan_pppoe:     vlanP||String(cur.vlan_pppoe||''),
      tipo_autenticacao: 'MAC',
      nome:           String(body.nome||cur.nome||lg.login||'')
    });
    let r2; try{ r2 = await ixcPut.call(this,'radpop_radio_cliente_fibra/'+idFibra, upd); }
    catch(e){ return [{ json:{ ok:false, etapa:'editar', id_cliente_fibra:idFibra, erro:errInfo(e), autorizar:r1 } }]; }
    // Modo seguro: só completa o cadastro (NÃO grava na OLT)
    if(String(body.somente_completar||'')==='1')
      return [{ json:{ ok:!(r2&&r2.type==='error'), acao, etapa:'completar', id_cliente_fibra:idFibra, vlan, vlan_pppoe:vlanP, id_projeto:idProjeto, id_caixa_ftth:idCaixa, porta_ftth:portaFtth, login_ativo:(lg&&lg.ativo), editar:r2 } }];
    // 3) gravar dispositivo → envia o comando/provisiona na OLT
    let r3; try{ r3 = await ixcWrite.call(this,'botao_gravar_dispositivo_22408',{ id:idFibra }); }
    catch(e){ return [{ json:{ ok:false, etapa:'gravar', id_cliente_fibra:idFibra, erro:errInfo(e), autorizar:r1, editar:r2 } }]; }
    const ok3 = !(r3 && r3.type==='error');
    return [{ json:{ ok:ok3, acao, id_cliente_fibra:idFibra, vlan, vlan_pppoe:vlanP, bridge:String(body.bridge||'0'), autorizar:r1, editar:r2, gravar:r3 } }];
  }
  return [{ json:{ ok:false, erro:'ação não suportada: '+acao } }];
} catch(e){
  return [{ json:{ ok:false, erro: errInfo(e) } }];
}
