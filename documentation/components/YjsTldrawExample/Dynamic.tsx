import dynamic from "next/dynamic";

const ComponentWithNoSSR = dynamic(() => import("./YjsTldrawExample"), {
  ssr: false,
});

function Dynamic(props) {
  return <ComponentWithNoSSR {...props} />;
}

export default Dynamic;
