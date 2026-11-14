# Fuentes fotográficas territoriales

Las 16 regiones tienen al menos una fotografía real y verificada. Hay 32 imágenes en total: una principal y una urbana o territorial por región. Todas provienen de **Wikimedia Commons**.

## Procedimiento de verificación

1. **Búsqueda** con la API de Commons (`generator=search`). Se da prioridad a la categoría *Quality images*.
2. **Filtros automáticos**:
   - licencia leída desde `extmetadata.LicenseShortName`; solo se aceptan CC BY/BY-SA 2.0–4.0, CC0 y dominio público;
   - ancho de 1600 px o más;
   - orientación horizontal;
   - sin restricciones en `extmetadata.Restrictions`.
3. **Revisión visual** en hojas de contacto. Se descartan:
   - imágenes de otro lugar, por ejemplo el monumento a los Héroes de Iquique en Santiago, Ovalle (Coquimbo) bajo la búsqueda «Atacama» o resultados de Tailandia bajo «Ñuble»;
   - fotos con marca de agua;
   - fotos de personas identificables como tema principal;
   - mapas o fotos históricas cuando se busca el territorio actual.
4. **Descarga** de la miniatura oficial de Commons (1920 px), que se reduce a **1600 px y 800 px** y se convierte a **WebP**. No se hace ninguna otra modificación (sin recortes destructivos, filtros ni retoque).
5. **Registro** de los metadatos en `src/data/media/territorialPhotos.ts` (tipo `PhotoCredit` en `photoCredits.ts`): autoría, título del archivo, URL, licencia, URL de la licencia, fecha de consulta, texto alternativo y comuna (CUT).

## Reglas de uso en la interfaz

- **Crédito visible**: toda fotografía muestra lugar, autoría, licencia (enlazada) y enlace al archivo original. La pantalla **Créditos** reúne la lista completa.
- **Rótulo honesto**: `photoForComuna(cut)` devuelve una foto solo si fue tomada en esa comuna. Si se usa la de la región, el dossier lo indica: «Fotografía regional, no de esta comuna».
- **Sin foto verificada**: se usa `CartographicFallback`, una silueta real con geometría oficial y el nombre del lugar. Nunca se recurre a una imagen genérica o generada.
- **Carga**: diferida (`loading="lazy"`), salvo la portada; `srcset` de 800/1600 px; `width` y `height` declarados para evitar saltos de diseño.

## Pendiente

- Cada región tiene hoy dos fotografías: la principal y una urbana o territorial. Falta completar la tercera categoría en todas.
- Agregar fotografías institucionales (Congreso en Valparaíso, La Moneda) para las pantallas Congreso y Gobierno, verificando en cada caso que la licencia sea libre. Una fotografía gubernamental no es automáticamente de dominio público.

## Inventario

| Región | Categoría | Lugar | Autoría | Licencia | Archivo en Commons | Archivo local | Consultado |
|---|---|---|---|---|---|---|---|
| AP | principal | Arica, vista desde el Morro | Heretiq | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5) | [AricaViewCoast.jpg](https://commons.wikimedia.org/wiki/File:AricaViewCoast.jpg) | `public/assets/territories/ap/principal.webp` | 2026-11-14 |
| AP | urbana | Calle Arturo Prat, Arica | Bachelot Pierre J-P | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Arica, Chili.jpg](https://commons.wikimedia.org/wiki/File:Arica,_Chili.jpg) | `public/assets/territories/ap/urbana.webp` | 2026-11-14 |
| TA | principal | Iquique | Diego Delso | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Vista de Iquique, Chile, 2016-02-11, DD 06.JPG](https://commons.wikimedia.org/wiki/File:Vista_de_Iquique,_Chile,_2016-02-11,_DD_06.JPG) | `public/assets/territories/ta/principal.webp` | 2026-11-14 |
| TA | territorial | Cerro Dragón e Iquique | Diego Delso | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Vista de Iquique, Chile, 2016-02-11, DD 20.JPG](https://commons.wikimedia.org/wiki/File:Vista_de_Iquique,_Chile,_2016-02-11,_DD_20.JPG) | `public/assets/territories/ta/territorial.webp` | 2026-11-14 |
| AN | principal | Mina de Chuquicamata, Calama | Diego Delso | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Mina de Chuquicamata, Calama, Chile, 2016-02-01, DD 110-112 PAN.JPG](https://commons.wikimedia.org/wiki/File:Mina_de_Chuquicamata,_Calama,_Chile,_2016-02-01,_DD_110-112_PAN.JPG) | `public/assets/territories/an/principal.webp` | 2026-11-14 |
| AN | territorial | La Portada, Antofagasta | valledelhuasco | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [ANTOFAGASTA - LA PORTADA - panoramio.jpg](https://commons.wikimedia.org/wiki/File:ANTOFAGASTA_-_LA_PORTADA_-_panoramio.jpg) | `public/assets/territories/an/territorial.webp` | 2026-11-14 |
| AT | principal | Catedral de Copiapó | Carlos Teixidor Cadenas | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Catedral de Copiapó. Región de Atacama. Chile.jpg](https://commons.wikimedia.org/wiki/File:Catedral_de_Copiap%C3%B3._Regi%C3%B3n_de_Atacama._Chile.jpg) | `public/assets/territories/at/principal.webp` | 2026-11-14 |
| AT | urbana | Estación de ferrocarril de Copiapó | Layon Art | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Estacion de trenes de Copiapo.jpg](https://commons.wikimedia.org/wiki/File:Estacion_de_trenes_de_Copiapo.jpg) | `public/assets/territories/at/urbana.webp` | 2026-11-14 |
| CO | principal | Faro Monumental de La Serena | Rjcastillo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Faro Monumental de La Serena. 09.12.2022.jpg](https://commons.wikimedia.org/wiki/File:Faro_Monumental_de_La_Serena._09.12.2022.jpg) | `public/assets/territories/co/principal.webp` | 2026-11-14 |
| CO | urbana | Plaza de Armas de La Serena | Rjcastillo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Fuente en la Plaza de Armas, La Serena.jpg](https://commons.wikimedia.org/wiki/File:Fuente_en_la_Plaza_de_Armas,_La_Serena.jpg) | `public/assets/territories/co/urbana.webp` | 2026-11-14 |
| VA | principal | Cerro Alegre, Valparaíso | Carlos Figueroa Rojas | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Casa de Miramar con Lautaro Rosas, Valparaíso 20201102 109.jpg](https://commons.wikimedia.org/wiki/File:Casa_de_Miramar_con_Lautaro_Rosas,_Valpara%C3%ADso_20201102_109.jpg) | `public/assets/territories/va/principal.webp` | 2026-11-14 |
| VA | urbana | Cerro Alegre, Valparaíso | Diego Delso | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Cerro Alegre, Valparaíso, Chile2.jpg](https://commons.wikimedia.org/wiki/File:Cerro_Alegre,_Valpara%C3%ADso,_Chile2.jpg) | `public/assets/territories/va/urbana.webp` | 2026-11-14 |
| RM | principal | Santiago de Chile | Rjcastillo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Edificios en Santiago de Chile II.jpg](https://commons.wikimedia.org/wiki/File:Edificios_en_Santiago_de_Chile_II.jpg) | `public/assets/territories/rm/principal.webp` | 2026-11-14 |
| RM | urbana | Mercado Central de Santiago | W. Pfahler | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0) | [Konstruktionsdetail der Markthalle von Santiago de Chile.jpg](https://commons.wikimedia.org/wiki/File:Konstruktionsdetail_der_Markthalle_von_Santiago_de_Chile.jpg) | `public/assets/territories/rm/urbana.webp` | 2026-11-14 |
| OH | principal | Plaza de Los Héroes, Rancagua | Vessna | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Plaza de Los Héroes de Rancagua.JPG](https://commons.wikimedia.org/wiki/File:Plaza_de_Los_H%C3%A9roes_de_Rancagua.JPG) | `public/assets/territories/oh/principal.webp` | 2026-11-14 |
| OH | urbana | Rancagua hacia la cordillera | Aeveraal | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Rancagua Vista.jpg](https://commons.wikimedia.org/wiki/File:Rancagua_Vista.jpg) | `public/assets/territories/oh/urbana.webp` | 2026-11-14 |
| ML | principal | Centro de Talca | RL GNZLZ from Chile | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [Talca, plaza (41238929085).jpg](https://commons.wikimedia.org/wiki/File:Talca,_plaza_(41238929085).jpg) | `public/assets/territories/ml/principal.webp` | 2026-11-14 |
| ML | urbana | Plaza de Armas de Talca | TomasVial | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) | [Plaza de Armas de Talca en 2024 03.jpg](https://commons.wikimedia.org/wiki/File:Plaza_de_Armas_de_Talca_en_2024_03.jpg) | `public/assets/territories/ml/urbana.webp` | 2026-11-14 |
| NB | principal | Catedral de Chillán | Cuidro | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Catedral de Chillán sin antenas.jpg](https://commons.wikimedia.org/wiki/File:Catedral_de_Chill%C3%A1n_sin_antenas.jpg) | `public/assets/territories/nb/principal.webp` | 2026-11-14 |
| NB | urbana | Centro de Chillán (vista aérea) | José Joaquín Cortes | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Vista aerea Plaza de armas - Plaza Santo Domingo - Plaza San Francisco Chillan.jpg](https://commons.wikimedia.org/wiki/File:Vista_aerea_Plaza_de_armas_-_Plaza_Santo_Domingo_-_Plaza_San_Francisco_Chillan.jpg) | `public/assets/territories/nb/urbana.webp` | 2026-11-14 |
| BI | principal | Plaza de la Independencia, Concepción | TomasVial | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Plaza de la Independencia de Concepción.jpg](https://commons.wikimedia.org/wiki/File:Plaza_de_la_Independencia_de_Concepci%C3%B3n.jpg) | `public/assets/territories/bi/principal.webp` | 2026-11-14 |
| BI | urbana | Plaza de la Independencia, Concepción | LuisCG11 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Plaza de la Independencia - Wikipaseo fotográfico Concepción 2019 - (290).jpg](https://commons.wikimedia.org/wiki/File:Plaza_de_la_Independencia_-_Wikipaseo_fotogr%C3%A1fico_Concepci%C3%B3n_2019_-_(290).jpg) | `public/assets/territories/bi/urbana.webp` | 2026-11-14 |
| AR | principal | Volcán Villarrica desde Pucón | Draceane | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Pucón, 2019 (01), Volcán Villarrica.jpg](https://commons.wikimedia.org/wiki/File:Puc%C3%B3n,_2019_(01),_Volc%C3%A1n_Villarrica.jpg) | `public/assets/territories/ar/principal.webp` | 2026-11-14 |
| AR | urbana | Pabellón El Amor de Chile, Temuco | Carlos Figueroa Rojas | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Pabellón El Amor de Chile, Temuco, 2019-01-07.jpg](https://commons.wikimedia.org/wiki/File:Pabell%C3%B3n_El_Amor_de_Chile,_Temuco,_2019-01-07.jpg) | `public/assets/territories/ar/urbana.webp` | 2026-11-14 |
| LR | principal | Valdivia desde el puente Pedro de Valdivia | Draceane | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Vista de Valdivia (Puente PdeV, 02a).jpg](https://commons.wikimedia.org/wiki/File:Vista_de_Valdivia_(Puente_PdeV,_02a).jpg) | `public/assets/territories/lr/principal.webp` | 2026-11-14 |
| LR | urbana | Muelle Schuster, Valdivia | Carlos Figueroa Rojas | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Muelle Schuster, Valdivia, 20190216 - 05.jpg](https://commons.wikimedia.org/wiki/File:Muelle_Schuster,_Valdivia,_20190216_-_05.jpg) | `public/assets/territories/lr/urbana.webp` | 2026-11-14 |
| LL | principal | Palafitos de Castro, Chiloé | Draceane | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Castro – palafitos 02.jpg](https://commons.wikimedia.org/wiki/File:Castro_%E2%80%93_palafitos_02.jpg) | `public/assets/territories/ll/principal.webp` | 2026-11-14 |
| LL | urbana | Costanera de Puerto Montt | Rjcastillo | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [Skatepark, Puerto Montt - A74060520240105.jpg](https://commons.wikimedia.org/wiki/File:Skatepark,_Puerto_Montt_-_A74060520240105.jpg) | `public/assets/territories/ll/urbana.webp` | 2026-11-14 |
| AI | principal | Coyhaique desde la Reserva Nacional | Rakela | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [Coyhaique desde la RNC.jpg](https://commons.wikimedia.org/wiki/File:Coyhaique_desde_la_RNC.jpg) | `public/assets/territories/ai/principal.webp` | 2026-11-14 |
| AI | urbana | Feria de las Quintas, Coyhaique | Dcupita | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [Feria de las Quintas - Coyhaique.jpg](https://commons.wikimedia.org/wiki/File:Feria_de_las_Quintas_-_Coyhaique.jpg) | `public/assets/territories/ai/urbana.webp` | 2026-11-14 |
| MA | principal | Punta Arenas y el estrecho de Magallanes | W. Bulach | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [00 2521 Punta Arenas - Chile.jpg](https://commons.wikimedia.org/wiki/File:00_2521_Punta_Arenas_-_Chile.jpg) | `public/assets/territories/ma/principal.webp` | 2026-11-14 |
| MA | urbana | Plaza Muñoz Gamero, Punta Arenas | W. Bulach | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [00ß 2930. Punta Arenas - Chile.jpg](https://commons.wikimedia.org/wiki/File:00%C3%9F_2930._Punta_Arenas_-_Chile.jpg) | `public/assets/territories/ma/urbana.webp` | 2026-11-14 |
