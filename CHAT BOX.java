import java.net.http.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;

public class MiniChat {
  static String KEY = System.getenv("GROQ_API_KEY");
  static String MODEL = "llama-3.1-8b-instant";

  static String ask(String user) throws Exception {
    String body =  """
      {"model":"%s","messages":[{"role":"user","content":%s}]}
      """.formatted(MODEL, toJson(user));
    var req = HttpRequest.newBuilder()
        .uri(URI.create("https://api.groq.com/openai/v1/chat/completions"))
        .header("Authorization","Bearer "+KEY)
        .header("Content-Type","application/json")
        .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8)).build();
    var res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).body();
    return quickGrab(res, "\"content\":\"", "\"");
  }

  static String toJson(String s){ return "\"" + s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n")+"\""; }
  static String quickGrab(String src, String start, String end){
    int i = src.indexOf(start); if(i<0) return src; i += start.length(); int j = src.indexOf(end, i);
    return j<0 ? src.substring(i) : src.substring(i, j).replace("\\n","\n").replace("\\\"","\"");
  }

  public static void main(String[] a) throws Exception {
    var sc = new java.util.Scanner(System.in);
    System.out.println("MiniChat (type 'quit' to exit)");
    for(;;){
      System.out.print("You: "); String q = sc.nextLine();
      if(q.equalsIgnoreCase("quit")) break;
      System.out.println("Bot: " + ask(q));
}
}
}