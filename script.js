// Melhorias de validação: ativar validação nativa e tratar confirmação de senha.
(function(){
    const form = document.getElementById('inscricaoForm');
    if(!form) return;
    const password = document.getElementById('senha');
    const confirm = document.getElementById('confirmar_senha');
    const erroSenha = document.getElementById('erro-senha');

    // Definir dinamicamente o max do campo birthdate para a data de hoje (YYYY-MM-DD)
    (function setMaxBirthdate(){
        const input = document.getElementById('birthdate');
        if(!input) return;
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        input.max = `${yyyy}-${mm}-${dd}`;
    })();

    // Atualiza setCustomValidity dinamicamente enquanto o usuário digita
    function validateMatch(){
        if(confirm.value === ''){
            confirm.setCustomValidity('');
            erroSenha.textContent = '';
            return;
        }
        if(password.value !== confirm.value){
            confirm.setCustomValidity('As senhas não coincidem.');
            erroSenha.textContent = 'As senhas não coincidem.';
        } else {
            confirm.setCustomValidity('');
            erroSenha.textContent = '';
        }
    }

    // Mostrar/ocultar dica de senha com base na validade do campo senha
    const senhaHint = document.getElementById('senha-hint');
    function updateSenhaHint(){
        if(!senhaHint) return;
        // o campo senha é válido se satisfaz minlength e pattern
        if(password.checkValidity()){
            senhaHint.classList.add('hidden');
            senhaHint.setAttribute('aria-hidden', 'true');
        } else {
            senhaHint.classList.remove('hidden');
            senhaHint.setAttribute('aria-hidden', 'false');
        }
    }
    password.addEventListener('input', updateSenhaHint);
    // Também atualizar quando o usuário tentar enviar (para forçar a exibição)
    form.addEventListener('invalid', function(e){
        if(e.target === password) updateSenhaHint();
    }, true);

    password.addEventListener('input', validateMatch);
    confirm.addEventListener('input', validateMatch);

    form.addEventListener('submit', function(e){
        // Primeiro, deixe o browser validar os constraints (pattern, minlength, required)
        if(!form.reportValidity()){
            // reportValidity já mostra mensagens nativas
            e.preventDefault();
            return;
        }

        // Certifique-se da validação customizada (confirmação de senha)
        validateMatch();
        if(!confirm.checkValidity()){
            // exibe a mensagem de confirmação
            confirm.reportValidity();
            e.preventDefault();
            return;
        }

        // Aqui o formulário está válido; envio segue normalmente (ou pode usar fetch)
    });
})();

// Rotas page: OpenRouteService-based routing and map helpers
(function(){
        // Only run on the rotas page when the route controls exist
        if(!document.getElementById('get-route')) return;

        // ORS key: prefer a per-page value if present (window.ORS_API_KEY or data-ors-key on body),
        // otherwise fall back to the placeholder so code doesn't accidentally send requests.
        const ORS_API_KEY = (function(){
            try{
                if(window.ORS_API_KEY) return window.ORS_API_KEY;
                if(document.body && document.body.dataset && document.body.dataset.orsKey) return document.body.dataset.orsKey;
            }catch(e){}
            return "SUA_CHAVE_AQUI";
        })();

        function fitMapToViewport(){
                const header = document.querySelector('.header');
                const footer = document.querySelector('.footer');
                const mapEl = document.getElementById('map');
                const headerH = header ? header.getBoundingClientRect().height : 0;
                const footerH = footer ? footer.getBoundingClientRect().height : 0;
                const targetH = Math.max(200, window.innerHeight - headerH - footerH);
                if(mapEl) mapEl.style.height = targetH + 'px';
        }

        window.addEventListener('resize', function(){ fitMapToViewport(); if(window._gp_map) window._gp_map.invalidateSize(); });
        document.addEventListener('DOMContentLoaded', fitMapToViewport);
        // run immediately in case this script is loaded after DOMContent
        fitMapToViewport();

        // initialize map (with zoom controls disabled to match site style)
        const map = L.map('map', { zoomControl: false }).setView([-23.5015, -47.4526], 13);
        window._gp_map = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap'
        }).addTo(map);

        // invalidate size after a short delay to ensure tiles render
        setTimeout(function(){ try{ map.invalidateSize(); }catch(e){} }, 100);

        let markers = [];
        let routeLine = null;

        // avoid area (example: Sorocaba)
        const avoidCenter = [-23.5015, -47.4526];
        const avoidRadius = 700; // meters
        const avoidCircle = L.circle(avoidCenter, {
            color: 'red',
            fillColor: 'red',
            fillOpacity: 0.25,
            radius: avoidRadius
        }).addTo(map).bindPopup('Área de evitação');

        function circleToPolygon(center, radius, points = 60) {
            const coords = [];
            const earthRadius = 6378137; // m
            const lat = center[0] * Math.PI / 180;
            for (let i = 0; i < points; i++) {
                const angle = (i / points) * (2 * Math.PI);
                const dx = radius * Math.cos(angle);
                const dy = radius * Math.sin(angle);
                const latOffset = (dy / earthRadius) * (180 / Math.PI);
                const lonOffset = (dx / (earthRadius * Math.cos(lat))) * (180 / Math.PI);
                coords.push([center[1] + lonOffset, center[0] + latOffset]);
            }
            coords.push(coords[0]);
            return [coords];
        }

        // map clicks -> add marker if outside avoid area
        map.on('click', (e) => {
            const distance = map.distance(e.latlng, avoidCircle.getLatLng());
            if (distance < avoidRadius) {
                alert("❌ Não é permitido selecionar dentro da área vermelha!");
                return;
            }
            if (markers.length >= 2) {
                alert("⚠️ Máximo de 2 pontos. Limpe para adicionar novos.");
                return;
            }
            const marker = L.marker(e.latlng).addTo(map);
            markers.push(marker);
        });

        // clear-all button
        const clearBtn = document.getElementById('clear-all');
        if(clearBtn) clearBtn.onclick = () => {
            markers.forEach(m => map.removeLayer(m));
            markers = [];
            if (routeLine) map.removeLayer(routeLine);
        };

        // get-route -> call ORS and draw route avoiding polygon
        const getRouteBtn = document.getElementById('get-route');
        if(getRouteBtn) getRouteBtn.onclick = async () => {
            if (!ORS_API_KEY || ORS_API_KEY === "SUA_CHAVE_AQUI")
                return alert('⚠️ Insira sua chave ORS diretamente no código antes de continuar.');

            if (markers.length < 2)
                return alert('Selecione dois pontos no mapa.');

            const coords = markers.map(m => [m.getLatLng().lng, m.getLatLng().lat]);
            const avoidPolygon = circleToPolygon(avoidCenter, avoidRadius);

            const body = {
                coordinates: coords,
                format: "geojson",
                options: {
                    avoid_polygons: {
                        type: "Polygon",
                        coordinates: avoidPolygon
                    }
                }
            };

            try {
                const res = await fetch(`https://api.openrouteservice.org/v2/directions/foot-walking/geojson`, {
                    method: "POST",
                    headers: {
                        "Authorization": ORS_API_KEY,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body)
                });

                const data = await res.json();

                if (!res.ok || !data.features) {
                    console.error(data);
                    return alert("Erro ao calcular rota. Verifique sua chave ou tente outro ponto.");
                }

                const routeCoords = data.features[0].geometry.coordinates.map(c => [c[1], c[0]]);
                if (routeLine) map.removeLayer(routeLine);
                routeLine = L.polyline(routeCoords, { color: 'blue', weight: 4 }).addTo(map);
                map.fitBounds(routeLine.getBounds());

            } catch (err) {
                console.error(err);
                alert("Erro de conexão com o OpenRouteService.");
            }
        };

})();
// Map initialization for rotas.html — centralized from inline script
(function(){
    // only run on pages that include the map element
    if(!document.getElementById('map')) return;
    // If a page has the route controls (#get-route) we prefer the ORS/block above to initialize
    // the map and routing. This prevents double initialization on rotas.html.
    if(document.getElementById('get-route')) return;
    try {
        var map = L.map('map').setView([-23.5505, -46.6333], 14);

        L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
        }).addTo(map);

        var pontos = [];
        var rota = null;

        // Clique no mapa para adicionar pontos e criar rota
        map.on('click', function (e) {
            pontos.push(e.latlng);
            L.marker(e.latlng).addTo(map);

                if (pontos.length === 2) {
                    if (rota) map.removeControl(rota);


                    // perfil fixo: caminhada (para rotas a pé)
                    var profile = 'walking';
                    var lineColor = '#4caf50';

                    rota = L.Routing.control({
                        waypoints: pontos,
                        router: L.Routing.osrmv1({
                            serviceUrl: "https://router.project-osrm.org/route/v1",
                            profile: profile
                        }),
                        createMarker: function () { return null; },
                        lineOptions: { styles: [{ color: lineColor, weight: 5 }] },
                        showAlternatives: true
                    }).addTo(map);

                    // quando a rota for encontrada, mostrar distância/tempo em #info
                    rota.on('routesfound', function(e){
                        try{
                            var routes = e.routes || [];
                            if(routes.length > 0){
                                var s = routes[0].summary;
                                var km = (s.totalDistance/1000);
                                var minutes = Math.round(s.totalTime/60);
                                var infoEl = document.getElementById('info');
                                if(infoEl){
                                    infoEl.textContent = 'Caminhada — ' + km.toFixed(2) + ' km • ' + minutes + ' min';
                                }
                            }
                        }catch(err){
                            console.warn('Erro ao processar resumo da rota:', err);
                        }
                    });

                    rota.on('routingerror', function(err){
                        var infoEl = document.getElementById('info');
                        if(infoEl) infoEl.textContent = 'Não foi possível calcular a rota. Tente novamente.';
                        console.error('Routing error', err);
                    });

                    // reset para permitir nova rota
                    pontos = [];
                }
        });

        // Botão limpar rota
        var limparBtn = document.getElementById('limpar');
        if(limparBtn){
            limparBtn.addEventListener('click', function(){
                if (rota) {
                    map.removeControl(rota);
                    rota = null;
                }
                // remove marcadores (instâncias de L.Marker)
                map.eachLayer(function (layer) {
                    if (layer instanceof L.Marker) map.removeLayer(layer);
                });
                // restaurar instrução padrão
                var infoEl = document.getElementById('info');
                if(infoEl) infoEl.textContent = 'Clique primeiro na saída, depois no destino';
            });
        }
    } catch (err) {
        console.error('Erro ao inicializar o mapa:', err);
    }
})();

// Login form handling (simulado)
(function(){
    // util: hash string com SHA-256 e retorna hex
    async function hashString(str){
        // tenta usar SubtleCrypto; se não disponível, usa fallback simples (não seguro, apenas para protótipo)
        try{
            if(window.crypto && crypto.subtle && crypto.subtle.digest){
                const enc = new TextEncoder();
                const data = enc.encode(str);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
        }catch(err){
            console.warn('SubtleCrypto unavailable or failed, using fallback hash', err);
        }
        // fallback: djb2
        let h = 5381;
        for(let i=0;i<str.length;i++) h = ((h<<5) + h) + str.charCodeAt(i);
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    // salvar usuário no localStorage
    async function saveUser({email, displayName, username, password}){
        const users = JSON.parse(localStorage.getItem('gp_users') || '{}');
        const key = (email || username).toLowerCase();
        const passwordHash = await hashString(password);
        users[key] = { email, displayName, username, passwordHash };
        localStorage.setItem('gp_users', JSON.stringify(users));
    }

    // buscar usuário
    async function findUserByKey(key){
        const users = JSON.parse(localStorage.getItem('gp_users') || '{}');
        return users[(key||'').toLowerCase()] || null;
    }

    // Signup: interceptar o envio do form de inscrição e salvar
    const signupForm = document.getElementById('inscricaoForm');
    if(signupForm){
        signupForm.addEventListener('submit', async function(e){
            e.preventDefault(); // prevenir envio padrão imediatamente
            try{
                if(!signupForm.reportValidity()){
                    return;
                }
            const email = document.getElementById('email').value.trim();
            const username = document.getElementById('displayName').value.trim();
            const password = document.getElementById('senha').value;
            const signupMsg = document.getElementById('signup-message');

            if(!email && !username){
                if(signupMsg) signupMsg.textContent = 'Informe e-mail ou usuário.';
                return;
            }

            const existing = await findUserByKey(email) || await findUserByKey(username);
            if(existing){
                if(signupMsg) signupMsg.textContent = 'Usuário ou e-mail já cadastrado.';
                return;
            }

                await saveUser({ email, displayName: username, username, password });
                // redirecionar para rotas.html após cadastro
                window.location.href = 'rotas.html';
            }catch(err){
                console.error('Erro no cadastro:', err);
                if(signupMsg) signupMsg.textContent = 'Erro ao cadastrar. Veja o console para mais detalhes.';
            }
        });
    }

    // Login: validar contra localStorage
    const loginForm = document.getElementById('loginForm');
    if(loginForm){
        loginForm.addEventListener('submit', async function(e){
            e.preventDefault(); // previne envio padrão imediatamente
            try{
                if(!loginForm.reportValidity()){
                    return;
                }
                const key = document.getElementById('login-identifier').value.trim();
                const password = document.getElementById('login-password').value;
                const loginMsg = document.getElementById('login-message');

                const user = await findUserByKey(key);
                if(!user){
                    if(loginMsg) loginMsg.textContent = 'Usuário ou e-mail não encontrado.';
                    return;
                }

                const hash = await hashString(password);
                if(hash === user.passwordHash){
                    // login bem-sucedido: redirecionar
                    window.location.href = 'rotas.html';
                } else {
                    if(loginMsg) loginMsg.textContent = 'Senha incorreta.';
                }
            }catch(err){
                console.error('Erro no login:', err);
                const loginMsg = document.getElementById('login-message');
                if(loginMsg) loginMsg.textContent = 'Erro ao processar login. Veja o console.';
            }
        });
    }
})();
