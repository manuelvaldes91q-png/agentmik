import type { KnowledgeEntry } from "@/lib/types";

export const knowledgeBase: KnowledgeEntry[] = [
  {
    id: "fw-001",
    category: "Firewall",
    topic: "Stateful Firewall Basics (RouterOS v7)",
    routerOsVersion: "7.x",
    content:
      "RouterOS v7 uses a connection tracking system by default. The recommended approach is to accept established and related connections first, then drop invalid. Place your input chain rules to protect the router itself, and forward chain rules to control traffic passing through. Always use raw rules for traffic that should bypass connection tracking for performance.",
    codeExample: `/ip firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
add action=accept chain=input protocol=icmp
add action=accept chain=input dst-port=22 protocol=tcp
add action=drop chain=input in-interface-list=WAN
/ipv6 firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid`,
    tags: ["firewall", "security", "input-chain", "v7"],
  },
  {
    id: "fw-002",
    category: "Firewall",
    topic: "Mangle Rules for Traffic Marking",
    routerOsVersion: "7.x",
    content:
      "Mangle rules allow you to mark packets and connections for use in routing decisions, queue trees, and other firewall rules. In RouterOS v7, use /ip firewall mangle with mark-routing, mark-connection, and mark-packet actions. Place marking rules early in the chain for efficiency.",
    codeExample: `/ip firewall mangle
add action=mark-connection chain=prerouting dst-port=80,443 protocol=tcp new-connection-mark=web-traffic
add action=mark-packet chain=prerouting connection-mark=web-traffic new-packet-mark=web-pkt
add action=mark-connection chain=prerouting dst-port=5060 protocol=udp new-connection-mark=voip-traffic
add action=mark-packet chain=prerouting connection-mark=voip-traffic new-packet-mark=voip-pkt passthrough=no`,
    tags: ["mangle", "traffic-control", "qos", "v7"],
  },
  {
    id: "fw-003",
    category: "Firewall",
    topic: "Raw Firewall Rules for Performance",
    routerOsVersion: "7.x",
    content:
      "Raw rules (/ip firewall raw) process before connection tracking, making them ideal for dropping unwanted traffic early and improving performance. Use raw rules to drop bogon addresses, known malicious IPs, or traffic that should never be tracked. This reduces CPU load on the connection tracking system.",
    codeExample: `/ip firewall raw
add action=drop chain=prerouting src-address=0.0.0.0/8
add action=drop chain=prerouting src-address=127.0.0.0/8
add action=drop chain=prerouting src-address=169.254.0.0/16
add action=drop chain=prerouting src-address=224.0.0.0/4
add action=drop chain=prerouting src-address=240.0.0.0/4
add action=drop chain=prerouting dst-address-type=!unicast in-interface-list=WAN`,
    tags: ["raw", "firewall", "performance", "bogon", "v7"],
  },
  {
    id: "fw-004",
    category: "Firewall",
    topic: "DDoS Protection with Firewall",
    routerOsVersion: "7.x",
    content:
      "Protect against DDoS using connection rate limits, SYN flood protection, and port scan detection. Use address lists for dynamic blocking. In RouterOS v7, combine raw rules with filter rules for maximum protection.",
    codeExample: `/ip firewall filter
add action=add-src-to-address-list address-list=blocked-ddos address-list-timeout=1h chain=input connection-state=new protocol=tcp src-address-list=port-scan
add action=add-src-to-address-list address-list=port-scan address-list-timeout=1m chain=input connection-state=new protocol=tcp psd=21,3s,3,1
add action=drop chain=input src-address-list=blocked-ddos
add action=jump chain=input connection-state=new jump-target=detect-ddos protocol=tcp
/ip firewall filter
add action=return chain=detect-ddos dst-limit=32,32,src-and-dst-addresses/10s
add action=add-src-to-address-list address-list=blocked-ddos address-list-timeout=1h chain=detect-ddos`,
    tags: ["ddos", "firewall", "security", "protection", "v7"],
  },
  {
    id: "wg-001",
    category: "VPN",
    topic: "WireGuard Setup (RouterOS v7)",
    routerOsVersion: "7.x",
    content:
      "WireGuard is natively supported in RouterOS v7. Create a WireGuard interface, assign an IP address, add peers, and create firewall rules to allow the WireGuard port (default 13231/UDP). WireGuard provides fast, modern VPN connectivity with minimal configuration.",
    codeExample: `/interface wireguard
add listen-port=13231 mtu=1420 name=wg0
/ip address
add address=10.10.10.1/24 interface=wg0 network=10.10.10.0
/interface wireguard peers
add allowed-address=10.10.10.2/32 interface=wg0 public-key="CLIENT_PUBLIC_KEY_HERE"
/ip firewall filter
add action=accept chain=input dst-port=13231 in-interface-list=WAN protocol=udp`,
    tags: ["wireguard", "vpn", "v7", "tunnel"],
  },
  {
    id: "vpn-001",
    category: "VPN",
    topic: "IPsec IKEv2 Server",
    routerOsVersion: "7.x",
    content:
      "IPsec IKEv2 provides secure site-to-site or road-warrior VPN connections. In RouterOS v7, use /ip ipsec for configuration. Create profiles, proposals, groups, peers, and policies. IKEv2 is preferred over IKEv1 for better security and NAT traversal.",
    codeExample: `/ip ipsec profile
add dh-group=ecp256 enc-algorithm=aes-256 hash-algorithm=sha256 name=ikev2-profile
/ip ipsec proposal
add auth-algorithms=sha256 enc-algorithms=aes-256-cbc name=ikev2-proposal
/ip ipsec peer
add exchange-mode=ikev2 name=peer1 passive=yes profile=ikev2-profile
/ip ipsec identity
add peer=peer1 auth-method=eap-radius generate-policy=port-strict`,
    tags: ["ipsec", "ikev2", "vpn", "v7"],
  },
  {
    id: "bgp-001",
    category: "Routing",
    topic: "BGP Configuration (RouterOS v7)",
    routerOsVersion: "7.x",
    content:
      "BGP in RouterOS v7 uses the /routing/bgp hierarchy. Create templates for reusable configurations, then add connections for each BGP peer. Use filters for prefix control. RouterOS v7 BGP supports IPv4/IPv6 unicast and multicast address families.",
    codeExample: `/routing bgp template
add as=65001 name=default-template router-id=1.1.1.1
/routing bgp connection
add disabled=no local.role=ebgp name=peer-isp \
    output.network=bgp-networks \
    remote.address=203.0.113.1.as=65000 \
    templates=default-template
/routing bgp network
add network=192.168.0.0/16 synchronize=no
/ip firewall filter
add action=accept chain=input dst-port=179 protocol=tcp src-address=203.0.113.1`,
    tags: ["bgp", "routing", "v7", "autonomous-system"],
  },
  {
    id: "ospf-001",
    category: "Routing",
    topic: "OSPFv2/v3 Configuration",
    routerOsVersion: "7.x",
    content:
      "OSPF in RouterOS v7 uses /routing/ospf for both IPv4 (OSPFv2) and IPv6 (OSPFv3). Define areas, interfaces, and networks. Use authentication for security. In v7, OSPF instances are more flexible with templates.",
    codeExample: `/routing ospf instance
add disabled=no name=default router-id=1.1.1.1
/routing ospf area
add disabled=no instance=default name=backbone area-id=0.0.0.0
/routing ospf interface-template
add area=backbone disabled=no interfaces=ether1,ether2 network=10.0.0.0/24
/routing ospf interface-template
add area=backbone disabled=no interfaces=ether3 network=172.16.0.0/24 passive=yes`,
    tags: ["ospf", "routing", "v7", "igp"],
  },
  {
    id: "qos-001",
    category: "QoS",
    topic: "Queue Trees for Bandwidth Control",
    routerOsVersion: "7.x",
    content:
      "Queue Trees in RouterOS v7 provide hierarchical bandwidth control. Use packet marks from mangle rules to direct traffic into queue trees. The PCQ (Per Connection Queue) classifier ensures fair bandwidth distribution among users. Set parent=global for root-level queues.",
    codeExample: `/queue tree
add max-limit=100M name=total-upload parent=global priority=1
add max-limit=200M name=total-download parent=global priority=1
add max-limit=50M name=upload-users parent=total-upload packet-mark=upload-pkt
add max-limit=100M name=download-users parent=total-download packet-mark=download-pkt
/queue type
add kind=pcq name=pcq-upload pcq-classifier=src-address pcq-rate=5M
add kind=pcq name=pcq-download pcq-classifier=dst-address pcq-rate=10M`,
    tags: ["qos", "queue", "bandwidth", "pcq", "v7"],
  },
  {
    id: "dns-001",
    category: "Services",
    topic: "DNS over HTTPS (DoH) Configuration",
    routerOsVersion: "7.x",
    content:
      "RouterOS v7 supports DNS over HTTPS for encrypted DNS queries. Configure /ip dns with use-doh-server parameter and allow-remote-requests=yes for the built-in DNS server to act as a resolver for LAN clients. Import the CA certificate for the DoH server.",
    codeExample: `/certificate
add name=cloudflare-doh common-name=cloudflare-dns.com
/certificate import file-name=cloudflare-doh passphrase=""
/ip dns
set allow-remote-requests=yes use-doh-server=https://1.1.1.1/dns-query verify-doh-cert=yes
/ip firewall nat
add action=dst-nat chain=dstnat dst-port=53 in-interface-list=LAN protocol=udp to-addresses=127.0.0.1 to-ports=53
add action=dst-nat chain=dstnat dst-port=53 in-interface-list=LAN protocol=tcp to-addresses=127.0.0.1 to-ports=53`,
    tags: ["dns", "doh", "security", "privacy", "v7"],
  },
  {
    id: "sec-001",
    category: "Security",
    topic: "Hardening RouterOS Security",
    routerOsVersion: "7.x",
    content:
      "Essential security hardening: 1) Change default admin password. 2) Disable unused services. 3) Use SSH instead of Telnet. 4) Restrict Winbox/Web access to trusted IPs. 5) Enable strong crypto. 6) Set up NTP for accurate logging. 7) Enable connection rate limiting on input chain. 8) Use address lists for dynamic blocking.",
    codeExample: `/ip service
set telnet disabled=yes
set ftp disabled=yes
set www disabled=yes
set ssh address=192.168.0.0/24 port=2222
set winbox address=192.168.0.0/24
/ip ssh set strong-crypto=yes
/system ntp client set enabled=yes
/system ntp client servers add address=pool.ntp.org
/ip firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
add action=accept chain=input protocol=icmp
add action=drop chain=input in-interface-list=WAN`,
    tags: ["security", "hardening", "best-practices", "v7"],
  },
  {
    id: "sec-002",
    category: "Security",
    topic: "Address Lists for Dynamic Blocking",
    routerOsVersion: "7.x",
    content:
      "Address lists in RouterOS v7 enable dynamic IP blocking. Add IPs to lists with timeout for temporary blocks. Use in firewall rules for efficient filtering. Combine with connection limiting for automated threat response.",
    codeExample: `/ip firewall address-list
add list=trusted-admins address=192.168.1.10
add list=blocked-bruteforce address-list-timeout=1d
/ip firewall filter
add action=add-src-to-address-list address-list=blocked-bruteforce address-list-timeout=1d chain=input connection-state=new dst-port=22 protocol=tcp src-address-list=ssh-stage3
add action=add-src-to-address-list address-list=ssh-stage3 address-list-timeout=1m chain=input connection-state=new dst-port=22 protocol=tcp src-address-list=ssh-stage2
add action=add-src-to-address-list address-list=ssh-stage2 address-list-timeout=1m chain=input connection-state=new dst-port=22 protocol=tcp src-address-list=ssh-stage1
add action=add-src-to-address-list address-list=ssh-stage1 address-list-timeout=1m chain=input connection-state=new dst-port=22 protocol=tcp`,
    tags: ["security", "address-list", "brute-force", "v7"],
  },
  {
    id: "bridge-001",
    category: "Switching",
    topic: "Bridge with VLAN Filtering",
    routerOsVersion: "7.x",
    content:
      "Use bridge VLAN filtering in RouterOS v7 instead of switch chip VLANs for better compatibility. Create a bridge, add ports, configure VLAN filtering with bridge VLANs, and set PVID on access ports. Hardware offloading is available on supported devices (CRS3xx, CRS5xx).",
    codeExample: `/interface bridge
add name=bridge1 vlan-filtering=yes
/interface bridge port
add bridge=bridge1 interface=ether2 pvid=10
add bridge=bridge1 interface=ether3 pvid=20
add bridge=bridge1 interface=ether4 pvid=10
/interface bridge vlan
add bridge=bridge1 tagged=ether1 untagged=ether2,ether4 vlan-ids=10
add bridge=bridge1 tagged=ether1 untagged=ether3 vlan-ids=20
/interface vlan
add interface=bridge1 name=vlan10-mgmt vlan-id=10
add interface=bridge1 name=vlan20-users vlan-id=20`,
    tags: ["bridge", "vlan", "switching", "v7"],
  },
  {
    id: "queue-001",
    category: "QoS",
    topic: "Simple Queues vs Queue Trees",
    routerOsVersion: "7.x",
    content:
      "Simple queues (/queue simple) are easier to configure and work well for basic bandwidth limiting. Queue trees (/queue tree) are more powerful and require mangle marks but offer hierarchical control. For large deployments, queue trees with PCQ are recommended over simple queues. In RouterOS v7, use queue trees for complex QoS policies.",
    codeExample: `/queue simple
add max-limit=10M/20M name=user1 target=192.168.1.10/32
add max-limit=10M/20M name=user2 target=192.168.1.11/32

/ip firewall mangle
add action=mark-packet chain=postrouting dst-address=192.168.1.10 new-packet-mark=to-user1
add action=mark-packet chain=postrouting dst-address=192.168.1.11 new-packet-mark=to-user2
/queue tree
add max-limit=20M name=download-user1 packet-mark=to-user1 parent=global
add max-limit=20M name=download-user2 packet-mark=to-user2 parent=global`,
    tags: ["qos", "queue", "bandwidth", "v7"],
  },
  {
    id: "script-001",
    category: "Scripting",
    topic: "RouterOS Scripting Basics",
    routerOsVersion: "7.x",
    content:
      "RouterOS scripts use a custom scripting language. Variables use the :local or :global prefix. Use :if/:do for conditionals, :for/:while for loops, and :put for output. Scripts can be scheduled with /system scheduler. Common use cases include automated backups, dynamic DNS updates, and monitoring.",
    codeExample: `/system script
add name=backup-script source={
    :local date [/system clock get date]
    :local time [/system clock get time]
    /export file=backup-$date-$time
    :log info "Backup created: backup-$date-$time"
}
/system scheduler
add name=daily-backup interval=1d start-time=03:00:00 on-event=backup-script`,
    tags: ["scripting", "automation", "backup", "v7"],
  },
  {
    id: "monitor-001",
    category: "Monitoring",
    topic: "SNMP and Monitoring Setup",
    routerOsVersion: "7.x",
    content:
      "Enable SNMP for network monitoring tools like Zabbix, PRTG, or LibreNMS. In RouterOS v7, configure /snmp with community strings and contact/location info. Use SNMPv3 for secure monitoring. Also enable /tool graphing for built-in traffic graphs accessible via HTTP.",
    codeExample: `/snmp set enabled=yes
/snmp community
set [find default=yes] addresses=192.168.0.0/24 name=monitoring
/tool graphing interface
add allow-address=192.168.0.0/24
/tool graphing resource
add allow-address=192.168.0.0/24
/ip firewall filter
add action=accept chain=input dst-port=161 protocol=udp src-address=192.168.0.5`,
    tags: ["snmp", "monitoring", "zabbix", "v7"],
  },
  {
    id: "bgp-002",
    category: "Routing",
    topic: "BGP Troubleshooting and Best Practices",
    routerOsVersion: "7.x",
    content:
      "Common BGP issues: 1) AS number mismatch. 2) Missing firewall rules for port 179. 3) Incorrect network advertisements. 4) Route filtering issues. Always verify with /routing bgp session print. Use logging to debug: /system logging add topics=bgp. In v7, use /routing/route/print to see the routing table with BGP routes.",
    codeExample: `/routing bgp session print
/routing route print where bgp=yes
/system logging add topics=bgp
/ip firewall filter
add action=accept chain=input dst-port=179 protocol=tcp
add action=log chain=input log-prefix="BGP-DEBUG" dst-port=179 protocol=tcp`,
    tags: ["bgp", "troubleshooting", "routing", "v7"],
  },
  {
    id: "v6-fw-001",
    category: "Firewall",
    topic: "Firewall Basico (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En RouterOS v6, el firewall usa la misma estructura que v7 pero sin raw rules avanzadas. La regla base es aceptar conexiones establecidas/relacionadas primero, luego drop invalid. En v6 no existe /ip firewall raw con la misma flexibilidad de v7. Usa connection-rate y connection-limit para proteccion basica contra DDoS.",
    codeExample: `/ip firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
add action=accept chain=input protocol=icmp
add action=accept chain=input dst-port=22 protocol=tcp src-address-list=allowed
add action=drop chain=input in-interface=ether1
add action=add-src-to-address-list address-list=blocked address-list-timeout=1d chain=input connection-limit=100,32 protocol=tcp`,
    tags: ["firewall", "security", "v6", "input-chain"],
  },
  {
    id: "v6-bgp-001",
    category: "Routing",
    topic: "BGP en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "En RouterOS v6, BGP se configura con /routing bgp peer. La diferencia principal con v7 es que v6 usa 'peer' en lugar de 'session'. Para ver sesiones activas usa /routing bgp peer print donde state=established. Los filtros de rutas se hacen con /routing filter chain.",
    codeExample: `/routing bgp peer add name=ISP-Primary remote-address=203.0.113.1 remote-as=64512 disabled=no
/routing bgp peer print where state=established
/routing bgp advertisements print
/ip firewall filter add action=accept chain=input dst-port=179 protocol=tcp`,
    tags: ["bgp", "routing", "v6", "peer"],
  },
  {
    id: "v6-nat-001",
    category: "Firewall",
    topic: "NAT y Masquerade (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En RouterOS v6, NAT se configura igual que en v7 con /ip firewall nat. Para enrutadores con IP publica dinamica, usa action=masquerade en lugar de action=src-nat. Masquerade es mas lento pero funciona con IPs dinamicas. Para rendimiento, usa src-nat cuando tengas IP fija.",
    codeExample: `/ip firewall nat
add action=masquerade chain=srcnat out-interface=ether1
# Para IP fija (mejor rendimiento):
/ip firewall nat
add action=src-nat chain=srcnat out-interface=ether1 to-addresses=203.0.113.10`,
    tags: ["nat", "masquerade", "firewall", "v6"],
  },
  {
    id: "v6-ospf-001",
    category: "Routing",
    topic: "OSPF en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "OSPF en v6 se configura con /routing ospf instance y /routing ospf area. Los comandos son similares a v7 pero con sintaxis diferente. Para ver vecinos: /routing ospf neighbor print. Usa /routing ospf interface print para verificar que las interfaces estan en la area correcta.",
    codeExample: `/routing ospf instance set [find default=yes] router-id=10.0.0.1
/routing ospf area set [find default=yes] area-id=0.0.0.0
/routing ospf interface add interface=ether2 network-type=broadcast
/routing ospf neighbor print`,
    tags: ["ospf", "routing", "v6"],
  },
  {
    id: "v6-api-001",
    category: "API",
    topic: "Habilitar API en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "Para habilitar la API en RouterOS v6, usa /ip service enable api. El puerto por defecto es 8728 (sin SSL) y 8729 (con SSL). En v6, asegurate de crear un usuario de solo lectura para monitoreo y restringir el acceso por IP. La API de v6 y v7 son compatibles para comandos basicos como /interface/print, /system/resource/print, y /system/identity/print.",
    codeExample: `/ip service enable api
/ip service set api address=IP_DEL_SERVIDOR
/user add name=monitor group=read password=CONTRASENA_FUERTE
/user group set read policy=api,read,test`,
    tags: ["api", "configuration", "v6", "security"],
  },
  {
    id: "v6-basic-001",
    category: "Configuracion",
    topic: "Configuracion Basica de Interfaces (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En RouterOS v6, las interfaces se configuran con /ip address para asignar IPs. Para ver el estado de las interfaces usa /interface print. Para ver trafico en tiempo real: /interface monitor-traffic [find]. Para ver estadisticas acumuladas: /interface print stats. Las interfaces ether son las tarjetas de red fisicas, bridge agrupa interfaces, vlan crea VLANs, y pppoe-out para conexiones PPPoE.",
    codeExample: `/ip address add address=192.168.1.1/24 interface=ether2
/ip address print
/interface print
/interface print stats
/interface monitor-traffic ether1`,
    tags: ["interfaces", "configuracion", "v6", "basico", "trafico"],
  },
  {
    id: "v6-basic-002",
    category: "Configuracion",
    topic: "DHCP Server y Cliente (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En v6, para crear un DHCP server: primero crea un pool de IPs, luego configura la red DHCP, y finalmente habilita el server. Para DHCP client (WAN): /ip dhcp-client add interface=ether1. Para ver leases: /ip dhcp-server lease print. El DHCP server de v6 usa /ip dhcp-server setup que es un wizard interactivo.",
    codeExample: `/ip pool add name=dhcp-pool ranges=192.168.1.100-192.168.1.200
/ip dhcp-server add name=dhcp1 interface=ether2 address-pool=dhcp-pool
/ip dhcp-server network add address=192.168.1.0/24 gateway=192.168.1.1 dns-server=8.8.8.8
/ip dhcp-server lease print
/ip dhcp-client add interface=ether1 disabled=no`,
    tags: ["dhcp", "configuracion", "v6", "basico"],
  },
  {
    id: "v6-basic-003",
    category: "Configuracion",
    topic: "DNS y Ruta por Defecto (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "Para configurar DNS en v6: /ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes. Para habilitar cache DNS: /ip dns cache flush. Para ruta por defecto: /ip route add dst-address=0.0.0.0/0 gateway=IP_DEL_GATEWAY. Para ver rutas: /ip route print. Para verificar conectividad: /ping 8.8.8.8.",
    codeExample: `/ip dns set servers=8.8.8.8,8.8.4.4 allow-remote-requests=yes
/ip dns cache print
/ip route add dst-address=0.0.0.0/0 gateway=190.1.1.1
/ip route print
/ping 8.8.8.8 count=5
/tool traceroute 8.8.8.8`,
    tags: ["dns", "routing", "v6", "basico", "conectividad"],
  },
  {
    id: "v6-basic-004",
    category: "Configuracion",
    topic: "PPPoE en RouterOS v6 (Comun en ISPs)",
    routerOsVersion: "6.x",
    content:
      "PPPoE es muy comun en ISPs con MikroTik v6. Para configurar PPPoE client: /interface pppoe-client add name=pppoe-out1 interface=ether1 user=USUARIO password=CONTRASENA add-default-route=yes. Para ver estado: /interface pppoe-client print stats. Para desconectar: /interface pppoe-client disable pppoe-out1. En el lado del servidor: /interface pppoe-server server.",
    codeExample: `/interface pppoe-client add name=pppoe-out1 interface=ether1 user=cliente1 password=pass123 add-default-route=yes disabled=no
/interface pppoe-client print
/interface pppoe-client print stats
# Lado servidor:
/ppp secret add name=cliente1 password=pass123 service=pppoe
/interface pppoe-server server set default-service=pppoe-service1`,
    tags: ["pppoe", "isp", "v6", "conexion", "wan"],
  },
  {
    id: "v6-basic-005",
    category: "Configuracion",
    topic: "Monitoreo de Trafico en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "Para monitorear trafico en v6: /interface print stats muestra bytes acumulados por interfaz. /interface monitor-traffic muestra tasas en tiempo real (rx-bits-per-second, tx-bits-per-second). Para monitoreo por SNMP: /snmp set enabled=yes. Para graficos: /tool graphing interface set [find] allow-address=REDE. Para ver conexiones activas: /ip firewall connection print. Para ver el trafico por IP: /ip accounting print.",
    codeExample: `/interface print stats
/interface monitor-traffic ether1
/interface monitor-traffic [find]
/ip firewall connection print count
/ip accounting print
/tool bandwidth-test IP_SERVIDOR direction=both`,
    tags: ["monitoreo", "trafico", "v6", "estadisticas", "interfaces"],
  },
  {
    id: "v6-basic-006",
    category: "Configuracion",
    topic: "Queues y Control de Ancho de Banda (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En v6, para limitar ancho de banda usa /queue simple. Simple queues son la forma mas facil de limitar velocidad por IP o subred. Para Queue Trees necesitas mangle rules primero. PCQ (Per Connection Queue) permite repartir ancho de banda equitativamente entre usuarios.",
    codeExample: `/queue simple add name=limite-usuario target=192.168.1.100/32 max-limit=10M/10M
queue simple add name=limite-red target=192.168.1.0/24 max-limit=50M/50M
/queue simple print
# PCQ para compartir ancho de banda equitativamente:
/queue type add name=pcq-download kind=pcq pcq-classifier=dst-address
/queue type add name=pcq-upload kind=pcq pcq-classifier=src-address
/queue simple add name=usuarios target=192.168.1.0/24 queue=pcq-upload/pcq-download`,
    tags: ["queue", "bandwidth", "v6", "qos", "limitar"],
  },
  {
    id: "v6-basic-007",
    category: "Configuracion",
    topic: "Comandos de Diagnostico en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "Comandos esenciales de diagnostico en v6: /ping para verificar conectividad. /tool traceroute para rastrear rutas. /tool profile para ver uso de CPU por proceso. /log print para ver logs del sistema. /system resource print para ver recursos del sistema. /interface monitor-traffic para ver trafico en tiempo real. /ip firewall connection print para ver conexiones activas. /tool netwatch para monitorear hosts.",
    codeExample: `/ping 8.8.8.8 count=5
/tool traceroute 8.8.8.8
/log print where topics~"info"
/system resource print
/interface monitor-traffic [find]
/ip firewall connection print count
/tool netwatch print
/tool profile`,
    tags: ["diagnostico", "troubleshooting", "v6", "ping", "traceroute", "logs"],
  },
  {
    id: "v6-basic-008",
    category: "Seguridad",
    topic: "Firewall Basico para Redes Pequenas (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "Firewall basico para v6 en redes pequenas o ISPs: aceptar establecidos/relacionados primero, permitir ICMP, permitir acceso admin por SSH, permitir trafico LAN, y drop todo lo demas del WAN. Para proteger contra port scans: agregar a address-list con timeout. Para DDoS basico: limitar conexiones nuevas por segundo.",
    codeExample: `/ip firewall filter
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
add action=accept chain=input protocol=icmp
add action=accept chain=input dst-port=22 protocol=tcp src-address-list=admin
add action=accept chain=input in-interface=ether2
add action=drop chain=input in-interface=ether1 comment="Drop WAN input"
add action=accept chain=forward connection-state=established,related
add action=drop chain=forward connection-state=invalid
add action=accept chain=forward in-interface=ether2
add action=drop chain=forward comment="Drop all forward"
/ip firewall address-list add list=admin address=TU_IP_PUBLICA`,
    tags: ["firewall", "seguridad", "v6", "basico", "proteccion"],
  },
  {
    id: "v6-basic-009",
    category: "Configuracion",
    topic: "Bridge y VLAN en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "En v6, para crear un bridge: /interface bridge add name=bridge1. Para agregar puertos: /interface bridge port add bridge=bridge1 interface=ether2. Para VLANs: /interface vlan add name=vlan10 vlan-id=10 interface=bridge1. Para filtrar VLANs en el bridge: /interface bridge set bridge1 vlan-filtering=yes. Importante: activa RSTP para evitar loops: /interface bridge set bridge1 protocol-mode=rstp.",
    codeExample: `/interface bridge add name=bridge1 protocol-mode=rstp
/interface bridge port add bridge=bridge1 interface=ether2
/interface bridge port add bridge=bridge1 interface=ether3
/interface vlan add name=vlan10 vlan-id=10 interface=bridge1
/ip address add address=10.0.10.1/24 interface=vlan10`,
    tags: ["bridge", "vlan", "v6", "red", "switching"],
  },
  {
    id: "v6-basic-010",
    category: "Configuracion",
    topic: "Hotspot en RouterOS v6",
    routerOsVersion: "6.x",
    content:
      "El Hotspot de MikroTik v6 permite autenticacion de usuarios para acceso a internet. Se configura con /ip hotspot. El wizard /ip hotspot setup crea automaticamente el server, perfil, y pagina de login. Para usuarios: /ip hotspot user add. Para ver usuarios activos: /ip hotspot active print. Para limitar tiempo o trafico por usuario usa user profiles.",
    codeExample: `/ip hotspot setup
/ip hotspot user add name=usuario1 password=pass123
/ip hotspot user add name=usuario2 password=pass456 limit-uptime=2h
/ip hotspot active print
/ip hotspot user print
/ip hotspot profile set [find default=yes] html-directory=hotspot`,
    tags: ["hotspot", "autenticacion", "v6", "wifi", "portal"],
  },
  {
    id: "v6-routing-001",
    category: "Routing Avanzado",
    topic: "Ruteo Recursivo con Scope y Target-Scope (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "El ruteo recursivo en v6 permite failover automatico. Usa scope para limitar la profundidad de busqueda y target-scope para definir el alcance del gateway. Para failover con dos gateways, la ruta principal tiene scope=10 y la secundaria scope=20. Si el gateway principal falla (ping check con /tool netwatch), la ruta se invalida y el trafico usa la secundaria. La clave es usar check-gateway=ping con /tool netwatch para detectar fallos.",
    codeExample: `/tool netwatch add host=190.1.1.1 interval=5s timeout=1s up-script="" down-script=""
/tool netwatch add host=190.1.2.1 interval=5s timeout=1s up-script="" down-script=""
/ip route
add dst-address=0.0.0.0/0 gateway=190.1.1.1 scope=10 target-scope=10 check-gateway=ping comment="WAN1 Principal"
add dst-address=0.0.0.0/0 gateway=190.1.2.1 scope=20 target-scope=20 routing-mark=WAN2 comment="WAN2 Backup"
add dst-address=190.1.1.1/32 gateway=190.1.1.1 scope=10
add dst-address=190.1.2.1/32 gateway=190.1.2.1 scope=10`,
    tags: ["routing", "failover", "scope", "v6", "recursivo", "netwatch"],
  },
  {
    id: "v6-routing-002",
    category: "Routing Avanzado",
    topic: "OSPF por Instancias y Areas Clasicas (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En v6, OSPF se configura con /routing ospf instance (una por proceso) y /routing ospf area (areas OSPF). Las interfaces se asignan con /routing ospf interface. Para filtrar rutas OSPF usa /routing ospf export-filter e import-filter. La redistribucion de rutas se hace dentro de la instancia con redistribute-connected, redistribute-static, etc. Para multiple areas, crea area=backbone para el area 0 y areas adicionales para stub/NSSA.",
    codeExample: `/routing ospf instance set [find default=yes] router-id=10.0.0.1 redistribute-connected=as-type-1 redistribute-static=no
/routing ospf area add name=area-stub area-id=0.0.0.1 type=stub
/routing ospf networks add network=192.168.1.0/24 area=backbone
/routing ospf networks add network=10.10.0.0/24 area=area-stub
/routing ospf interface add interface=ether2 network-type=broadcast
/routing ospf neighbor print
/routing ospf route print`,
    tags: ["ospf", "routing", "v6", "area", "instancia", "redistribucion"],
  },
  {
    id: "v6-routing-003",
    category: "Routing Avanzado",
    topic: "BGP con Filtros de Entrada para Full Route (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En v6, BGP se configura con /routing bgp peer. Para recibir full route (tabla completa de internet ~900k+ prefijos), usa prefix-limit=0 (sin limite) o un valor alto. Los filtros de entrada se hacen con /routing filter chain y se aplican al peer con in-filter. Para anunciar solo tus prefijos, usa out-filter con action=accept solo para tus redes. Usa /routing bgp advertisements print para ver que anuncias.",
    codeExample: `/routing filter chain add name=bgp-in-filter rule="if (dst in 0.0.0.0/0) { accept }"
/routing filter chain add name=bgp-out-filter rule="if (dst in 200.1.1.0/24) { accept } else { reject }"
/routing bgp peer add name=ISP-BGP remote-address=203.0.113.1 remote-as=64512 \\
  in-filter=bgp-in-filter out-filter=bgp-out-filter \\
  prefix-limit=1000000 ttl=default disabled=no
/routing bgp peer print where state=established
/routing bgp advertisements print
/ip route print where bgp=yes count-only`,
    tags: ["bgp", "routing", "v6", "full-route", "filtros", "peer"],
  },
  {
    id: "v6-qos-001",
    category: "QoS",
    topic: "PCC (Per Connection Classifier) para Balanceo Multi-WAN (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "PCC es el metodo preferido para balanceo de carga en v6. Usa mangle para marcar conexiones y rutas con routing-mark. La formula PCC es: per-connection-classifier=src-address:dst-address:N/M donde N es el numero de este gateway (0,1,...) y M es el total de gateways. Se necesitan reglas de mangle para marcar conexiones entrantes y salientes, rutas marcadas, y reglas de NAT para cada WAN.",
    codeExample: `/ip firewall mangle
add chain=prerouting dst-address-type=!local in-interface=ether2 per-connection-classifier=both-addresses:2/0 action=mark-connection new-connection-mark=wan1_conn passthrough=yes
add chain=prerouting dst-address-type=!local in-interface=ether2 per-connection-classifier=both-addresses:2/1 action=mark-connection new-connection-mark=wan2_conn passthrough=yes
add chain=prerouting connection-mark=wan1_conn action=mark-routing new-routing-mark=to_wan1
add chain=prerouting connection-mark=wan2_conn action=mark-routing new-routing-mark=to_wan2
/ip route
add dst-address=0.0.0.0/0 gateway=190.1.1.1 routing-mark=to_wan1
add dst-address=0.0.0.0/0 gateway=190.1.2.1 routing-mark=to_wan2
/ip firewall nat
add chain=srcnat out-interface=ether1 action=masquerade
add chain=srcnat out-interface=ether3 action=masquerade`,
    tags: ["pcc", "balanceo", "multi-wan", "v6", "mangle", "qos"],
  },
  {
    id: "v6-qos-002",
    category: "QoS",
    topic: "PCQ (Per Connection Queuing) para Gestion Masiva de Ancho de Banda (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "PCQ permite distribuir equitativamente el ancho de banda entre todos los usuarios sin crear una queue por cada IP. Se define un queue type PCQ con classifier por src-address (upload) y dst-address (download). Luego se aplica con /queue simple o /queue tree. Para limitar 5Mbps por usuario con un total de 100Mbps: max-limit=100M y pcq-rate=5M. PCQ es esencial para ISPs con cientos de clientes.",
    codeExample: `/queue type add name=pcq-download kind=pcq pcq-classifier=dst-address pcq-rate=5M
/queue type add name=pcq-upload kind=pcq pcq-classifier=src-address pcq-rate=5M
/queue simple add name=clientes-total target=192.168.1.0/24 max-limit=100M/100M queue=pcq-upload/pcq-download
/queue simple print
# Para ver estadisticas por usuario:
/queue simple print stats
# PCQ con prioridades (usando pcq-dst-address6-mask y pcq-src-address6-mask):
/queue type add name=pcq-prio-down kind=pcq pcq-classifier=dst-address pcq-rate=0 pcq-total-limit=2000`,
    tags: ["pcq", "queue", "qos", "v6", "ancho-banda", "isp"],
  },
  {
    id: "v6-security-001",
    category: "Seguridad Avanzada",
    topic: "Mitigacion DDoS con Address-Lists Dinamicas (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "Proteccion DDoS en v6 usando address-lists dinamicas con timeout. La tecnica: detectar conexiones excesivas por IP, agregar a address-list con timeout, y drop todo el trafico de esa IP. Usar connection-rate y connection-limit para detectar ataques. Para SYN flood, limitar nuevas conexiones TCP por segundo. Para UDP flood, limitar paquetes por segundo con /ip firewall filter y connection-limit.",
    codeExample: `/ip firewall filter
add chain=input action=add-src-to-address-list address-list=ddos-flood address-list-timeout=1h connection-rate=2000-4294967295 protocol=tcp connection-state=new
add chain=input action=add-src-to-address-list address-list=port-scan address-list-timeout=1d protocol=tcp psd=21,3s,3,1
add chain=input action=drop src-address-list=ddos-flood
add chain=input action=drop src-address-list=port-scan
add chain=input action=add-src-to-address-list address-list=brute-force address-list-timeout=1d connection-limit=3/30s protocol=tcp dst-port=22,8291
add chain=input action=drop src-address-list=brute-force
add chain=input action=drop protocol=udp dst-port=53 connection-limit=50/10s
add chain=forward action=drop src-address-list=ddos-flood
add chain=forward action=drop dst-address-list=ddos-flood`,
    tags: ["ddos", "seguridad", "v6", "firewall", "address-list", "brute-force"],
  },
  {
    id: "v6-security-002",
    category: "Seguridad Avanzada",
    topic: "FastTrack para Rendimiento (RouterOS v6.29+)",
    routerOsVersion: "6.x",
    content:
      "FastTrack (introducido en v6.29) permite que el trafico establecido y relacionado saltee el procesamiento del firewall, mejorando drasticamente el rendimiento. Se activa con action=fasttrack-connection en la regla de accept established/related. Nota: FastTrack solo funciona con CPU y no con hardware offload. FastTrack bypassa connection tracking, queue simple, y mangle. Deshabilitalo si usas queues complejas o mangle.",
    codeExample: `/ip firewall filter
add action=fasttrack-connection chain=connection-state=established,related
add action=accept chain=input connection-state=established,related
add action=drop chain=input connection-state=invalid
# Para verificar si FastTrack esta funcionando:
/ip firewall connection print where fasttrack-connection
# Si usas queues, NO habilites FastTrack o las queues no funcionaran:
# /ip firewall filter add action=accept chain=forward connection-state=established,related
# (sin fasttrack)`,
    tags: ["fasttrack", "rendimiento", "v6", "firewall", "optimizacion"],
  },
  {
    id: "v6-troubleshooting-001",
    category: "Troubleshooting",
    topic: "Analisis de CPU con /tool profile (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En v6, /tool profile muestra el uso de CPU por proceso interno. Ejecutalo por 10-30 segundos para ver que proceso consume mas CPU. Los procesos comunes que causan alta CPU: firewall (reglas mal ordenadas), routing (BGP con full table), queuing (demasiadas queues simples), networking (DDoS o flood). Si 'firewall' consume >30%, reordena las reglas para usar fasttrack o raw rules. Si 'routing' consume mucho, verifica que BGP no este recibiendo mas prefijos de los necesarios.",
    codeExample: `/tool profile duration=15
# Esperar 15 segundos y revisar la salida
# Si firewall es el problema:
/ip firewall filter print stats
# Reordenar reglas: established/related primero, drop invalid, luego el resto
# Si routing es el problema:
/routing bgp peer print stats
# Si networking es el problema:
/ip firewall connection print count
/interface ethernet monitor-traffic ether1`,
    tags: ["cpu", "profile", "troubleshooting", "v6", "rendimiento", "diagnostico"],
  },
  {
    id: "v6-troubleshooting-002",
    category: "Troubleshooting",
    topic: "Fragmentacion de Paquetes: MSS Clamping y MTU (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En tuneles L2TP/IPsec, PPPoE, y GRE, el MTU efectivo se reduce por la sobrecarga del encapsulamiento. Para evitar fragmentacion, ajusta el MSS con mangle rules. PPPoE: MTU 1492, MSS 1452. L2TP/IPsec: MTU ~1400, MSS ~1360. GRE: MTU 1476, MSS 1436. Usa /ip firewall mangle con action=change-mss y protocol=tcp tcp-flags=syn para ajustar MSS automaticamente. Tambien ajusta el MTU en la interfaz del tunel.",
    codeExample: `/ip firewall mangle
add chain=forward protocol=tcp tcp-flags=syn action=change-mss new-mss=1452 comment="MSS Clamp PPPoE"
add chain=forward protocol=tcp tcp-flags=syn action=change-mss new-mss=1360 out-interface=l2tp-out1 comment="MSS Clamp L2TP"
/interface pppoe-client set [find] mtu=1492 mru=1492
/interface l2tp-client set [find] mtu=1400 mru=1400
# Para diagnosticar problemas de fragmentacion:
/ping 8.8.8.8 size=1472 do-not-fragment
/tool ping 8.8.8.8 size=1400 do-not-fragment`,
    tags: ["mtu", "mss", "fragmentacion", "v6", "pppoe", "l2tp", "ipsec"],
  },
  {
    id: "v6-troubleshooting-003",
    category: "Troubleshooting",
    topic: "Optimizacion de RAM: Deshabilitar Paquetes Innecesarios (RouterOS v6)",
    routerOsVersion: "6.x",
    content:
      "En routers con poca RAM (RB750, RB951, hAP lite), deshabilitar paquetes innecesarios libera memoria. Los paquetes que mas RAM consumen: dude, hotspot, mpls, routing (si no usas BGP/OSPF), ppp,ups, wireless (si es cableado). Usa /system package print para ver los instalados y /system package disable para deshabilitar. El router debe reiniciarse para que tome efecto. Cuidado: no deshabilites system, routeros, security, o advanced-tools.",
    codeExample: `/system package print
# Identificar paquetes no usados
/system package disable hotspot
/system package disable mpls
/system package disable ppp
/system package disable wireless
/system package disable dhcp
/system reboot
# Despues del reboot verificar RAM libre:
/system resource print`,
    tags: ["ram", "memoria", "v6", "optimizacion", "paquetes", "rendimiento"],
  },
];

export function searchKnowledge(query: string): KnowledgeEntry[] {
  const lowerQuery = query.toLowerCase();
  const terms = lowerQuery.split(/\s+/).filter((t) => t.length > 2);

  return knowledgeBase
    .map((entry) => {
      let score = 0;
      const searchableText = `${entry.topic} ${entry.content} ${entry.tags.join(" ")} ${entry.category}`.toLowerCase();
      for (const term of terms) {
        if (entry.tags.some((tag) => tag.includes(term))) score += 3;
        if (entry.topic.toLowerCase().includes(term)) score += 2;
        if (entry.category.toLowerCase().includes(term)) score += 2;
        if (entry.content.toLowerCase().includes(term)) score += 1;
      }
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => r.entry);
}
